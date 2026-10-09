# Suture website

Plain HTML and CSS. No build step, no scripts, no external requests. Works offline.

## Replace before going live

Search for each of these in all files.

| Placeholder | Where | Replace with |
|---|---|---|
| `PURCHASE_URL` (the Buy button, `href="#buy-placeholder"`) | index.html | Your checkout link |
| `DOWNLOAD_URL` (the disabled Download button) | index.html | A link to the installer; remove the `disabled` class and change the `span` to an `a` |
| `[SHA-256 value, published with each release]`, `[installer file name]` | index.html (FAQ) | The real installer name and its SHA-256 |
| `[Publisher legal name]`, `[Publisher address/country]` | every page footer, privacy, terms, refund, contact | Your real details (ask your lawyer) |
| `suture-app` | og:image tag on every page, sitemap.xml, robots.txt | Your GitHub user name |
| Other `[bracketed]` text | privacy.html, terms.html, refund.html | Dates, periods, lawyer decisions |

Privacy, terms and refund pages are drafts for a lawyer. Remove the "Draft" note only after review.

The 404 page uses relative links, so on a deep wrong address it may show without styling. That is harmless.

## Publish on GitHub Pages (no technical knowledge needed)

1. Go to github.com and choose Sign up. Use suturesupport@gmail.com, pick a user name and a password, and confirm the email GitHub sends you.
2. Choose New repository (the green button, or the plus icon at the top right). Name it exactly `suture`. Set it to Public. Choose Create repository.
3. On the new repository page choose "uploading an existing file". Open this folder on your PC, select all files inside it (not the folder itself) and drag them into the browser. Wait until every file is listed, then choose Commit changes.
4. Open the repository Settings, then Pages (left menu). Under Build and deployment, set Source to "Deploy from a branch". Set Branch to `main` and the folder to `/ (root)`. Choose Save.
5. Wait one or two minutes and refresh the Pages screen. It shows your address:
   `https://suture-app.github.io/suture/`
   where `suture-app` is your GitHub user name.
6. Replace the `suture-app` placeholders (see the table) with your user name and upload those files again.

## Update the site later

Open the repository, open the file to change, choose the pencil icon, edit, then Commit changes. To replace several files, choose Add file, then Upload files, drop the new versions over the old ones and commit. The site updates in a minute or two.

## Files

index.html, changes.html, privacy.html, terms.html, refund.html, contact.html, 404.html, style.css, favicon.svg, suture-256.png (logo), icon_full.svg (logo, vector), robots.txt, sitemap.xml.
