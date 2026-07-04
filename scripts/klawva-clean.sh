#!/bin/bash
set -e

echo "=== Klawva Cleanup ==="
echo "Archiving sessions, freeing tokens, restarting gateway..."

ssh -o StrictHostKeyChecking=no -o ConnectTimeout=20 root@172.237.124.230 'klawva-clean'

echo ""
echo "All done. Tokens are free, Telegram bot is disabled, ready for new provisioning."
