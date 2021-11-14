#!/usr/bin/env bash
# Run ./deploy.sh
# This is a microservice to extract data from PayPal
base=${PWD##*/}
zp=$base".zip"
echo $zp

rm -f $zp

rm -rf node_modules
npm i --only=production

zip -r $zp * -x deploy.sh
if ! aws lambda create-function  \
    --function-name $base \
    --description "Handles PayPal transactions" \
    --handler app.handler \
    --runtime nodejs12.x \
    --memory-size 256 \
    --timeout 180 \
    --role arn:aws:iam::<YOUR_ACCOUNT>:role/bq-lambdas-LambdaRole-CREATE_YOUR_ROLE_FOR_LAMBDA \
    --environment Variables="{DEBUG=true,TESTING=false}" \
    --zip-file fileb://$zp;

    then

    echo ""
    echo "Function already exists, updating instead..."

    aws lambda update-function-code  \
    --function-name $base \
    --zip-file fileb://$zp;
fi
