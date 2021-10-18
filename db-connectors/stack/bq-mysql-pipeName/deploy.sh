#!/usr/bin/env bash
# Helper script in case you need a manual deploy (no Cloudformation) to AWS wit "-staging suffix".
# chmod +x deploy.sh
# Run ./deploy.sh
# This is a microservice to extract data from MySQl database

base=${PWD##*/}
zp=$base".zip"
echo $zp

rm -f $zp

rm -rf node_modules
npm i --only=production
# change VPC config  and Lambda role arn to your values
zip -r $zp * -x deploy.sh

lambdaRole=1234YourAccountNumber:role/yourLambdaRole
# LIVE VPC
subnet1=subnet-1
subnet2=subnet-2
subnet3=
securityGroupId=sg-1

if ! aws lambda create-function  \
    --function-name $base-staging \
    --description "Extracts switchboard MySQL data and saves to S3" \
    --handler app.handler \
    --runtime nodejs14.x \
    --memory-size 128 \
    --timeout 90 \
    --vpc-config SubnetIds=$subnet1,$subnet2,$subnet3,SecurityGroupIds=$securityGroupId  \
    --role arn:aws:iam::$lambdaRole \
    --environment Variables="{DEBUG=true,TESTING=true,NODE_ENV=production}" \
    --zip-file fileb://$zp;

    then

    echo ""
    echo "Function already exists, updating instead..."

    aws lambda update-function-code  \
    --function-name $base-staging \
    --zip-file fileb://$zp;
fi
