`deploy.yml` publishes the repository itself to GitHub Pages on every push to
`main`. There is no build step — that is one of the port's ground rules — so
the workflow only adds `.nojekyll` and uploads the tree.

Pages must be set to **Source: GitHub Actions** once, in Settings → Pages.
