# pipelinetools
Connect external data sources to your data warehouse
![](img/externalDataBigQuery.png?raw=true)

## db-connectors/stack/bq-mysql-pipeName
### Extract millions of rows from MySQL with AWS Lambda and Node.js.
Simple, reliable and memeory efficient AWS Lambda data extractor written in Node.JS. 
*Note:* rename `bq-mysql-pipeName` to your function name.
 
- Creates a Node.js stream to extract data from MySQL database.

### Testing and runing locally
- Adjust `db-connectors/stack/bq-mysql-pipeName/config/staging.yaml` and add your tables to extract data from.
- `npm run test` command would override `default.yaml` with params from `staging.yaml`.
- There are three modes to save extracted data:
    - 's3Stream': Extracts data in node.js streaming mode and uploads as one file to AWS S3 bucket in node.js streaming mode.
    - 'local': Extracts data in node.js streaming mode and saves locally in CSV format.
    - 's3':  Extracts data in node.js streaming mode and uploads to AWS S3 in batch mode, i.e. splitting file into smaller files.
~~~js
const DEBUG = process.env.DEBUG;
const SAVETO = process.env.SAVETO || 's3Stream'; // 'local'; // 's3';
const NODE_ENV = process.env.NODE_ENV || 'staging';
const BATCH_SIZE = process.env.BATCH_SIZE || 3000;
~~~

### Example
In your command line run:
```shell
$ SAVETO='local'
$ `npm run test`
```

Thi will save results as CSV file locally.

### Deploy
#### Deploy with Shell script
- Adjust `db-connectors/stack/bq-mysql-pipeName/deploy.sh`
- In your command line run `$ ./deploy.sh`

This will deploy a Lambda function using AWS CLI.

#### Deploy with Cloudformation
- Run `npm run predeploy` first. This would make the package lighter removing dev dependencies.
- Adjust `cf-config.yaml` 

- in command line run:
```shell
cd ./stack
```
~~~bash
aws cloudformation package \
    --region eu-west-1 \
    --template-file cf-config.yaml \
    --output-template-file cf-deploy.yaml \
    --s3-bucket lambdas.bq-shakhomirov.aws
~~~
**Note**: replace `lambdas.bq-shakhomirov.aws` with your bucket for dev artifacts.

~~~bash
aws cloudformation deploy \
    --region eu-west-1 \
    --template-file cf-deploy.yaml \
    --stack-name bq-mysql-connectors \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
        Testing="false"
~~~

# Contributing
Contributions are welcome. Please read the code of conduct and the contributing guidelines.

# License Summary
This project is licensed under the Apache-2.0 License.

# Features requests
I am tracking features requests from users here to prioritise what is important for our users. Please file an issue and we'll answer you as soon as possible.

# More
Contact me at [https://www.linkedin.com/in/mshakhomirov/](https://www.linkedin.com/in/mshakhomirov/)
