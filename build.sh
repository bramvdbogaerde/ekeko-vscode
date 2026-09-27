#!/bin/sh

npm run build-server   # builds damp.ekeko.jdtls and stages its jar in server/
npm run compile        # compiles the extension's TypeScript
npx vsce package --allow-missing-repository   # produces a .vsix
