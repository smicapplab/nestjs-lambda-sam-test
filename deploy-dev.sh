#!/bin/bash
echo "Deploying to Dev"

rm -rf dist/ .aws-sam/
npm run build
cp package.json dist/
cd dist 
npm install --omit=dev

cd ..
sam build 
sam deploy --config-env dev 