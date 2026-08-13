Greensboro Lottery Spotlight

Deploy both files to the frontend root:
  index.html
  gboro_lottery.jpg

The Greensboro spotlight is active now.

To turn it off later:
  Find the commented GREENSBORO ABC block in index.html
  Change:
      active: true
  to:
      active: false

Future image spotlight:
  Copy the Greensboro object and change image/imageAlt.
  Place the new image file beside index.html.
  Text-only spotlight objects do not need image/imageAlt.

No bp-test-app.js change is required.
