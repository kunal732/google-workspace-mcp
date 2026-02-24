#!/bin/bash
set -e

mkdir -p dist

npx esbuild src/index.ts \
  --bundle \
  --platform=node \
  --target=node18 \
  --format=esm \
  --banner:js="#!/usr/bin/env node
import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
  --outfile=dist/server.js

chmod +x dist/server.js
echo "Built dist/server.js"
