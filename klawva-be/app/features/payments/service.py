import hashlib
import logging
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.features.payments.contracts import PaymentProviderName
from app.features.payments.models import Payment
from app.features.payments.providers import (
    PaymentProviderError,
    ProviderInitResult,
    get_provider,
)
from app.features.sessions.models import Session
from app.platform.db.models.idempotency_key import IdempotencyKey


def _hash_body(raw_body: bytes) -> str:
    return hashlib.sha256(raw_body).hexdigest()


def _idempotency_key(scope: str, event_id: str) -> str:
    return f"{scope}:{event_id}"


async def initialize_payment(
    db: AsyncSession,
    *,
    session_id: str,
    provider_name: PaymentProviderName,
    amount_minor: int,
    currency: str,
    customer_email: str | None,
) -> tuple[Payment, ProviderInitResult]:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    import urllib.parse

    from app.platform.config import settings

    ends_at_str = ""
    if session.expires_at:
        ends_at_str = session.expires_at.isoformat()
    elif session.started_at:
        ends_at_str = (session.started_at + timedelta(hours=24)).isoformat()
    else:
        ends_at_str = (datetime.now(UTC) + timedelta(hours=24)).isoformat()

    params = {
        "channel": session.channel,
        "agent": session.agent_id,
        "endsAt": ends_at_str,
    }
    callback_url = (
        f"{settings.frontend_base_url}/session/{session_id}?{urllib.parse.urlencode(params)}"
    )

    provider = get_provider(provider_name)
    try:
        init_result = await provider.initialize_payment(
            amount_minor=amount_minor,
            currency=currency,
            session_id=session_id,
            customer_email=customer_email,
            callback_url=callback_url,
        )
    except PaymentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    payment = Payment(
        session_id=session_id,
        provider=provider_name,
        provider_reference=init_result.provider_reference,
        amount_minor=amount_minor,
        currency=currency.upper(),
        status=init_result.status,
        confirmed_at=datetime.now(UTC) if init_result.status == "confirmed" else None,
    )

    db.add(payment)
    if customer_email:
        session.customer_email = customer_email.strip().lower()
    if init_result.status == "confirmed":
        session.status = "ready"

    await db.commit()
    await db.refresh(payment)
    return payment, init_result


async def _queue_failed_reconciliation(
    db: AsyncSession,
    provider_name: str,
    provider_reference: str | None,
    raw_payload: bytes,
    error_message: str,
) -> None:
    from app.features.payments.models import FailedReconciliation

    failed = FailedReconciliation(
        provider_name=provider_name,
        provider_reference=provider_reference,
        raw_payload=raw_payload.decode("utf-8", errors="replace"),
        status="pending",
        attempts=0,
        error_message=error_message,
    )
    db.add(failed)


async def retry_failed_reconciliations(db: AsyncSession) -> int:
    from app.features.payments.models import FailedReconciliation

    stmt = select(FailedReconciliation).where(FailedReconciliation.status == "pending")
    result = await db.execute(stmt)
    failed_list = result.scalars().all()

    resolved_count = 0
    for failed in failed_list:
        failed.attempts += 1
        failed.last_attempt_at = datetime.now(UTC)
        try:
            raw_body = failed.raw_payload.encode("utf-8")
            success = await _process_webhook_internal(
                db,
                provider_name=failed.provider_name,
                raw_body=raw_body,
                parsed_provider_reference=failed.provider_reference,
            )
            if success:
                failed.status = "resolved"
                resolved_count += 1
            else:
                failed.status = "failed"
        except Exception as exc:
            failed.error_message = str(exc)
            if failed.attempts >= 5:
                failed.status = "failed"
            else:
                failed.status = "pending"

        db.add(failed)
        try:
            await db.commit()
        except Exception:
            await db.rollback()

    return resolved_count


async def _process_webhook_internal(
    db: AsyncSession,
    *,
    provider_name: PaymentProviderName,
    raw_body: bytes,
    parsed_provider_reference: str | None,
) -> bool:
    provider = get_provider(provider_name)

    if (
        provider_name == "nomba"
        and parsed_provider_reference
        and parsed_provider_reference.startswith("klawva_")
    ):
        import json

        from app.features.payments.models import VirtualAccount
        from app.features.payments.wallet_service import (
            credit_wallet,
            debit_wallet,
            get_or_create_wallet,
        )

        payload = json.loads(raw_body.decode("utf-8"))
        data = payload.get("data", {}) if isinstance(payload.get("data"), dict) else {}

        transaction_data = (
            data.get("transaction", {}) if isinstance(data.get("transaction"), dict) else {}
        )
        gross_minor = int(round(float(transaction_data.get("transactionAmount", 0.0)) * 100))
        if gross_minor <= 0:
            gross_minor = int(round(float(data.get("amount", 0.0)) * 100))

        fee_val = transaction_data.get("fee")
        fee_minor = int(round(float(fee_val) * 100)) if fee_val is not None else 0
        net_minor = max(0, gross_minor - fee_minor)

        if gross_minor < 500000:
            customer_data = (
                data.get("customer", {}) if isinstance(data.get("customer"), dict) else {}
            )
            sender_account_number = (
                customer_data.get("accountNumber")
                or transaction_data.get("senderAccountNumber")
                or data.get("senderAccountNumber")
            )
            sender_bank_code = (
                customer_data.get("bankCode")
                or transaction_data.get("senderBankCode")
                or data.get("senderBankCode")
            )
            sender_account_name = (
                customer_data.get("senderName")
                or transaction_data.get("senderAccountName")
                or data.get("senderAccountName")
            )

            va_stmt = select(VirtualAccount).where(
                VirtualAccount.nomba_account_ref == parsed_provider_reference
            )
            va_res = await db.execute(va_stmt)
            va = va_res.scalar_one_or_none()
            if va:
                wallet = await get_or_create_wallet(db, user_id=va.user_id)
                parsed_webhook = provider.parse_webhook(raw_body)

                await credit_wallet(
                    db,
                    wallet_id=wallet.id,
                    amount_minor=gross_minor,
                    reference=parsed_webhook.event_id,
                    description=f"Virtual account funding (Below minimum ₦5,000: ₦{gross_minor / 100:.2f})",
                    source="virtual_account",
                )

                await debit_wallet(
                    db,
                    wallet_id=wallet.id,
                    amount_minor=gross_minor,
                    reference=f"rev_{parsed_webhook.event_id}",
                    description=f"Reversal of below-minimum virtual account funding (Refunded to {sender_bank_code or 'Unknown'}/{sender_account_number or 'Unknown'})",
                    source="virtual_account",
                    allow_negative=True,
                )

            if sender_account_number and sender_bank_code:
                try:
                    payout_ref = await provider.trigger_payout(
                        amount_minor=gross_minor,
                        account_number=str(sender_account_number),
                        bank_code=str(sender_bank_code),
                        account_name=str(sender_account_name or "Customer"),
                        narration=f"Reversal: VA funding under ₦5,000 limit (Received: ₦{gross_minor / 100:.2f})",
                    )
                    logger.info(
                        "Automatic payout reversal triggered for VA funding underpayment, ref: %s",
                        payout_ref,
                    )
                except Exception as payout_err:
                    logger.error(
                        "Failed to automatically reverse underpaid VA funding: %s",
                        payout_err,
                        exc_info=True,
                    )
            raise HTTPException(status_code=400, detail="va_funding_below_minimum_reversed")

        va_stmt = select(VirtualAccount).where(
            VirtualAccount.nomba_account_ref == parsed_provider_reference
        )
        va_res = await db.execute(va_stmt)
        va = va_res.scalar_one_or_none()
        if not va:
            raise HTTPException(status_code=404, detail="virtual_account_not_found")

        wallet = await get_or_create_wallet(db, user_id=va.user_id)

        parsed_webhook = provider.parse_webhook(raw_body)
        is_reversal = (
            "reversal" in parsed_webhook.event_type.lower()
            or "revert" in parsed_webhook.event_type.lower()
        )
        if is_reversal:
            description = f"Reversal of virtual account funding (Gross: -₦{gross_minor / 100:.2f}, Fee: ₦{fee_minor / 100:.2f})"
            await debit_wallet(
                db,
                wallet_id=wallet.id,
                amount_minor=net_minor,
                reference=parsed_webhook.event_id,
                description=description,
                source="virtual_account",
                allow_negative=True,
            )
        else:
            description = f"Virtual account funding (Gross: ₦{gross_minor / 100:.2f}, Fee: ₦{fee_minor / 100:.2f})"
            await credit_wallet(
                db,
                wallet_id=wallet.id,
                amount_minor=net_minor,
                reference=parsed_webhook.event_id,
                description=description,
                source="virtual_account",
            )
        return True

    if parsed_provider_reference is None:
        raise HTTPException(status_code=400, detail="missing_reference")

    verification = await provider.verify_transaction(parsed_provider_reference)

    payment_statement = select(Payment).where(
        Payment.provider == provider_name,
        Payment.provider_reference == verification.provider_reference,
    )
    payment_result = await db.execute(payment_statement)
    payment = payment_result.scalar_one_or_none()

    if payment:
        session_id = payment.session_id
    else:
        session_id = verification.session_id

    if not session_id:
        raise HTTPException(status_code=422, detail="session_mapping_missing")

    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    db_payment = payment

    if verification.status == "confirmed":
        expected_amount = db_payment.amount_minor if db_payment is not None else None
        if expected_amount is None:
            from app.features.payments.billing import resolve_billing_profile_from_country

            billing = resolve_billing_profile_from_country(
                "NG" if provider_name == "nomba" else None
            )
            expected_amount = billing.amount_minor

        if verification.amount_minor < expected_amount:
            if payment is None:
                payment = Payment(
                    session_id=session_id,
                    provider=provider_name,
                    provider_reference=verification.provider_reference,
                    amount_minor=verification.amount_minor,
                    currency=verification.currency,
                    status="reversed",
                    confirmed_at=None,
                )
                db.add(payment)
            else:
                payment.status = "reversed"
                payment.confirmed_at = None

            sender_account_number = None
            sender_bank_code = None
            sender_account_name = None

            if provider_name == "nomba":
                import json

                payload = json.loads(raw_body.decode("utf-8"))
                data = payload.get("data", {}) if isinstance(payload.get("data"), dict) else {}
                tx_data = (
                    data.get("transaction", {}) if isinstance(data.get("transaction"), dict) else {}
                )
                customer_data = (
                    data.get("customer", {}) if isinstance(data.get("customer"), dict) else {}
                )
                sender_account_number = (
                    tx_data.get("senderAccountNumber")
                    or customer_data.get("accountNumber")
                    or verification.sender_account_number
                )
                sender_bank_code = (
                    tx_data.get("senderBankCode")
                    or customer_data.get("bankCode")
                    or verification.sender_bank_code
                )
                sender_account_name = (
                    tx_data.get("senderAccountName")
                    or customer_data.get("senderName")
                    or verification.sender_account_name
                )

                if sender_account_number and sender_bank_code:
                    try:
                        payout_ref = await provider.trigger_payout(
                            amount_minor=verification.amount_minor,
                            account_number=sender_account_number,
                            bank_code=sender_bank_code,
                            account_name=sender_account_name or "Customer",
                            narration=f"Reversal for underpaid checkout: {verification.provider_reference}",
                        )
                        logger.info(
                            "Automatic payout reversal triggered on Nomba, ref: %s", payout_ref
                        )
                    except Exception as payout_err:
                        logger.error(
                            "Failed to automatically reverse underpayment on Nomba: %s",
                            payout_err,
                            exc_info=True,
                        )

            from app.features.payments.wallet_service import (
                credit_wallet,
                debit_wallet,
                get_or_create_wallet,
            )
            from app.features.users.models import User

            user = None
            if session.user_id:
                user = await db.get(User, session.user_id)
            elif session.customer_email:
                user_stmt = select(User).where(User.email == session.customer_email)
                user_res = await db.execute(user_stmt)
                user = user_res.scalar_one_or_none()

            if user:
                wallet = await get_or_create_wallet(db, user_id=user.id)
                await credit_wallet(
                    db,
                    wallet_id=wallet.id,
                    amount_minor=verification.amount_minor,
                    reference=f"checkout_dep_{verification.provider_reference}",
                    description=f"Underpaid checkout deposit for hiring {session.agent_id} (Expected: ₦{expected_amount / 100:.2f}, Received: ₦{verification.amount_minor / 100:.2f})",
                    source="checkout",
                )

                await debit_wallet(
                    db,
                    wallet_id=wallet.id,
                    amount_minor=verification.amount_minor,
                    reference=f"checkout_rev_{verification.provider_reference}",
                    description=f"Reversal of underpaid checkout (Refunded to {sender_bank_code or 'Unknown'}/{sender_account_number or 'Unknown'})",
                    source="checkout",
                    allow_negative=True,
                )

            raise HTTPException(status_code=400, detail="insufficient_payment_amount_reversed")

    if payment is None:
        payment = Payment(
            session_id=session_id,
            provider=provider_name,
            provider_reference=verification.provider_reference,
            amount_minor=verification.amount_minor,
            currency=verification.currency,
            status=verification.status,
            confirmed_at=datetime.now(UTC) if verification.status == "confirmed" else None,
        )
        db.add(payment)
    else:
        payment.status = verification.status
        if verification.status == "confirmed":
            payment.confirmed_at = datetime.now(UTC)

    if verification.status == "confirmed":
        await record_checkout_wallet_transactions(
            db,
            session=session,
            provider_reference=verification.provider_reference,
            amount_minor=verification.amount_minor,
        )
        session.status = "ready"
    return True


async def process_webhook(
    db: AsyncSession,
    *,
    provider_name: PaymentProviderName,
    raw_body: bytes,
    signature_header: str | None,
    additional_headers: dict[str, str] | None = None,
) -> bool:
    provider = get_provider(provider_name)
    if not provider.verify_webhook_signature(
        raw_body, signature_header, additional_headers=additional_headers
    ):
        raise HTTPException(status_code=400, detail="invalid_webhook_signature")

    parsed = provider.parse_webhook(raw_body)
    scope = f"payments:{provider_name}:webhook"
    key = _idempotency_key(scope, parsed.event_id)

    existing_statement = select(IdempotencyKey).where(IdempotencyKey.key == key)
    existing_result = await db.execute(existing_statement)
    existing = existing_result.scalar_one_or_none()
    if existing is not None:
        return False

    _NON_RETRYABLE_DETAILS = {
        "insufficient_payment_amount_reversed",
        "va_funding_below_minimum_reversed",
    }

    try:
        success = await _process_webhook_internal(
            db,
            provider_name=provider_name,
            raw_body=raw_body,
            parsed_provider_reference=parsed.provider_reference,
        )
        if not success:
            return False
    except HTTPException as exc:
        if exc.detail in _NON_RETRYABLE_DETAILS:
            await _add_idempotency_key(
                db, scope, key, raw_body, parsed.provider_reference, status_code=exc.status_code
            )
            await db.commit()
            return True
        await _add_idempotency_key(
            db, scope, key, raw_body, parsed.provider_reference, status_code=exc.status_code
        )
        await _queue_failed_reconciliation(
            db,
            provider_name=provider_name,
            provider_reference=parsed.provider_reference,
            raw_payload=raw_body,
            error_message=exc.detail,
        )
        await db.commit()
        return True
    except Exception as exc:
        error_msg = str(exc)
        logger.warning("Webhook processing failed (reconciliation queued): %s", error_msg)
        await _queue_failed_reconciliation(
            db,
            provider_name=provider_name,
            provider_reference=parsed.provider_reference,
            raw_payload=raw_body,
            error_message=error_msg,
        )

    await _add_idempotency_key(db, scope, key, raw_body, parsed.provider_reference, status_code=200)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        logger.info("Duplicate webhook ignored (idempotency key: %s)", key)
        return False
    return True


async def _add_idempotency_key(
    db: AsyncSession,
    scope: str,
    key: str,
    raw_body: bytes,
    provider_reference: str | None,
    status_code: int = 200,
) -> None:
    from datetime import UTC, datetime, timedelta

    from app.platform.db.models.idempotency_key import IdempotencyKey

    expires_at = datetime.now(UTC) + timedelta(days=30)
    db.add(
        IdempotencyKey(
            scope=scope,
            key=key,
            request_hash=_hash_body(raw_body),
            response_json={
                "processed": True,
                "provider_reference": provider_reference,
            },
            status_code=status_code,
            expires_at=expires_at,
        )
    )


async def record_checkout_wallet_transactions(
    db: AsyncSession,
    *,
    session: Session,
    provider_reference: str,
    amount_minor: int,
) -> None:
    from app.features.users.models import User

    user = None
    if session.user_id:
        user = await db.get(User, session.user_id)
    elif session.customer_email:
        user_stmt = select(User).where(User.email == session.customer_email)
        user_res = await db.execute(user_stmt)
        user = user_res.scalar_one_or_none()

    if user:
        from app.features.payments.models import WalletTransaction
        from app.features.payments.wallet_service import (
            credit_wallet,
            debit_wallet,
            get_or_create_wallet,
        )

        wallet = await get_or_create_wallet(db, user_id=user.id)

        credit_ref = f"checkout_dep_{provider_reference}"
        debit_ref = f"checkout_hire_{provider_reference}"

        tx_check_stmt = select(WalletTransaction).where(WalletTransaction.reference == credit_ref)
        tx_check_res = await db.execute(tx_check_stmt)
        if tx_check_res.scalar_one_or_none() is None:
            await credit_wallet(
                db,
                wallet_id=wallet.id,
                amount_minor=amount_minor,
                reference=credit_ref,
                description=f"Checkout deposit for hiring {session.agent_id}",
                source="checkout",
            )
            await debit_wallet(
                db,
                wallet_id=wallet.id,
                amount_minor=amount_minor,
                reference=debit_ref,
                description=f"Agent hire fee: {session.agent_id}",
                source="checkout",
            )


async def require_confirmed_session_payment(db: AsyncSession, *, session_id: str) -> Payment:
    payment_statement = select(Payment).where(Payment.session_id == session_id)
    payment_result = await db.execute(payment_statement)
    payments = list(payment_result.scalars().all())

    if not payments:
        raise HTTPException(status_code=422, detail="payment_not_initialized")

    for payment in payments:
        if payment.status == "confirmed":
            return payment

    raise HTTPException(status_code=409, detail="payment_not_confirmed")
