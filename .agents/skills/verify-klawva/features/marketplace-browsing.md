# Marketplace browsing

Users discover and evaluate AI employees from the public marketplace grid. No login required.

## Sub-features

- `grid-load` the employee grid renders with cards showing name, tagline, category, price, and rating.
- `category-filter` clicking a category tab filters the grid to that category only.
- `detail-page` clicking a card opens the employee detail page with full description, price, and a hire button.
- `pricing-display` each card shows the price in NGN with the correct format.
- `empty-state` a category with no listings shows an appropriate message.

## How to get to it (user POV)

- Visit `www.klawva.xyz/employees` directly.
- Click "Employees" in the navbar from any page.
- Click "Hire an Employee" CTA on the landing page.

## Driving it with chrome-devtools

Preconditions:

- Klawva is healthy.
- At least one published listing exists (seed if needed).

- **Load the grid.** Navigate to `/employees`. Take a screenshot and ARIA snapshot. The snapshot must contain at least one link with a listing name and a StaticText showing a price.
- **Verify card content.** Each card should show: employee name (heading or link), tagline, category badge, price in ₦ format, and a star rating if reviews exist.
- **Filter by category.** Click a category button (e.g., "ops" or "research"). Take a screenshot. Only listings in that category should appear. Click "All" to restore.
- **Open detail page.** Click the first employee card. The URL should change to `/employees/:slug`. Take a screenshot. The page should show: name, tagline, full description, price, "Hire" button.
- **Navigate to checkout.** Click the "Hire" button. The URL should change to `/checkout?agent=:slug`.

## Gotchas

- The grid loads from `GET /api/listings` which returns only published listings. If no listings are seeded, the grid is empty and most sub-features cannot be verified.
- Category filters are client-side. If only one category has listings, filtering to others shows an empty grid, which is correct but looks like a bug.
- Prices are in Nigerian Naira (₦). The format is `₦X,XXX` with the symbol prefix.
