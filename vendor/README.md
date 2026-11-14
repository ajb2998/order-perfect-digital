# Libraries hosted with the site

These two files used to load from outside addresses. They are served from the site itself so the
prints page depends on nobody else's servers and the site can refuse scripts from anywhere else.

- jszip-3.10.1.min.js: JSZip 3.10.1, dist/jszip.min.js from the npm package, unchanged (MIT or GPLv3).
  Its SHA-512 is the one cdnjs publishes for this file.
- smartcrop-2.0.5.js: smartcrop 2.0.5, smartcrop.js from the npm package, unchanged (MIT).

To update one: add the new file with its version in the name and change the script tag in prints/index.html.
