# How to Export millions of rows in chunks, capture real-time data changes or extract data and save it to the Cloud or locally.
## Building a MySQL data connector for your data warehouse

[Github repository](https://github.com/mshakhomirov/pipelinetools)

## Intro
Imagine you are a Data engineer and you were tasked to sync data from one of your ***MySQL*** database instances and your ***data warehouse***.
This is a very common **scenario** in which you need to connect of of the most popular data sources to your data warehouse solution, i.e. Snowflake, Redshift or BigQuery. I previously wrote about **modern data stack** and various ways of doing it [here][1].
This article is a detailed summary on how to extract and save data from relational database (MySQL) without using 3rd paty apps.
I will give you with a detailed explanation of **Node.js** ***serverless*** application built with ***AWS Lambda*** function. This microservice will extract data from MySQL database and can be ran locally on your machine or/and from AWS account on a schedule.
There is also a more advanced example of the same application which creates **Node.JS** streams to extract and save data from MySQL to your ***AWS S3 datalake***.

## Outline
**You will learn how to:**
- create a simple **Node.js** app with **AWS Lambda**.
- use Node.js **streams** to optimise memory consumption.
- extract data and save it locally in CSV and JSON formats.
- export it into the Cloud Storage.
- use `yaml` config for your queries.
- deploy and schedule it.

> Simply run `$ npm run test` in your command line

## How to export data in chunks using MySQL native features
You would want to use `SELECT * INTO 'file.csv'` [functionality][2] to achieve this:
~~~sql
SELECT *
INTO OUTFILE 'file_0.csv' -- Change the filename here
FIELDS
  TERMINATED BY ','
  OPTIONALLY ENCLOSED BY '"'
  ESCAPED BY '\\'
  LINES TERMINATED BY '\n'
FROM table
WHERE id BETWEEN 0 AND 1000000 -- And change the range here
~~~

With a bit of tweaking and changing the `outfile` you'll achieve the desired outcome.
However, this is a manual operation and keep in mind that you would want to limit your range in `where` clause using indexed column. Otherwise your database will be having hard times.


## Very basic MySQL data connector with Node.JS

Skip this part if you are after more advanced examples with `streaming`, data transformation and `S3 upload`.
* Create a new folder for you Lamda: `$ mkdir mysql-connector`. `$ cd mysql-connector`. `$ npm init`. 
* Use npm to install [mysql][4] package for your lambda: `$npm i mysql2@2.0.0`
* Install run-local-lambda package. We will use it to trigger and test Lambda locally: `$ npm i run-local-lambda@1.1.1`
* In your Lambda root directory create a `config` file to define the pipeline configuration and tables to use:
  ~~~json
  {
    "Tables": [
      {
        "name" : "some_file_name_to_save_into",
        "sql"  : "SELECT *  FROM database_name.some_table where date = '2021-03-02';",
        "output": "local"
      }
      
    ],
    "rds_host": "some.rds-host.eu-west-1.rds.amazonaws.com",
    "name": "root",
    "password": "your-password",
    "db_name": "database_name",
    "save_bucket": "data.your-bucket-name.aws",
    "key": "some_file_prefix_to_save_into/"
  }

  ~~~
* Create an `async` function in your main application file `./app.js` to run **SQL query** from `./config.json` file.

**Your application folder now should look like this:**

~~~sh
.
├── test
│   └── data.json
├── app.js
├── config.json
├── package-lock.json
├── package.json
└── readme.md
~~~

**Your main application file `./app.js` would look like this:**
~~~js
const mysql = require('mysql2/promise');
const config = require('./config.json');

exports.handler = async (event, context) => {

    try {
        let data = await processEvent(event, tables);
        context.succeed(data);
    } catch (e) {
        console.log(e);
        context.done(e);
    }
};

let processEvent = async (event, tables) => {

   // This will create a connection to your database:
   let pool = mysql.createPool({
      host: config.rds_host,
      user: config.name,
      password: config.password,
      waitForConnections: true,
      connectionLimit:10,
      queueLimit:0,
      timezone: '+00:00'
   });

   const result = await getResult(sql, pool);

   return {'Query result': `${result}`}
}
;
~~~

> This is the gist of how to export data from MySQL programmatically. Very simple.

Run `$ npm run test` in your command line and that would extract data from MySQL database. Make sure your credentials and database host address are correct.
Now you can change query in your `./config.json` file and run them programmatically.


## How to use ***Node.js*** `stream` and export data from MySQL

> First of all, why use Node.js [stream][5]?

Well if your dataset is more than your memory then you would want to extract data in chunks like we did in step 1. that what `stream` is for. 
It can help you to optimise your app's memory and export data without loading all of the rows into memory. 

> If you use AWS Lambda or GCP Cloud functions it helps to save money and not to overprovision the memory resource.

Very often 128 Mb of allocated memory **is enough** to export a few million rows. 

> So with Node.js `stream` you can connect MySQL to your data warehouse more efficiently.

**The gist of it**

Let's say you want to extract data from MySQL row by row and save it locally as CSV. The example below would work with npm packages `mysql2` and `csv-stringify`.

~~~js
const mysql = require('mysql2/promise');
const csvstringify = require('csv-stringify');

...
const outputStream = fs.createWriteStream('output.csv', { encoding: 'utf8' }); // writable stream to save query results locally.
const s1 = connection.connection.query(sql); // establish a connection
s1.stream({ highWaterMark: BATCH_SIZE }) // readable stream from MySQL db. stream() is just to wrap into pipeable object, and not to enable 'result' events, they are emitted anyway.
    .pipe(csvstringify({ header: true }))
    .pipe(outputStream)
    .on('finish', () => { resolve('saved data locally'); });

~~~

## How to export data from MySQL efficiently with `stream` and save locally as CSV

All you need is a `queryDbAndSave()` function. Try to add this `async` example below into your `processEvent()` function.

~~~js
const queryDbAndSave = async(connection, sql, totalRecords, ts, s3key, bucket, output = 'local', dryRun = false) => {
    return new Promise((resolve, reject) => {
            if (output === 'local') {
            const outputStream = fs.createWriteStream('output.csv', { encoding: 'utf8' });
            s1.stream({ highWaterMark: BATCH_SIZE }) // stream() is just to wrap into pipeable object, and not to enable 'result' events, they are emitted anyway.
                .pipe(csvstringify({ header: true }))
                .pipe(outputStream)
                .on('finish', () => { resolve('saved data locally'); });
        });
}
~~~

**Add this to your `processEvent()` function like so:**

~~~js
const processEvent = async(event, tables, bucket, key) => {
... // Maybe evaulte query size, etc.
... // add some other queries and tables to your ./config.json maybe?
    for (const table of tables) {
        try {
            const result = await queryDbAndSave(connection, veryBiqSqlResult, size, ts, s3key, bucket, table.output, table.dryRun);
        } catch (e) {
            console.log(`ERROR: ${e.code} ${e.sqlMessage}`);
        }

    }

return console.log({ 'Finished processing tables': `${tables.length}` });
}
~~~

**Next** in your command line run: `$ npm run test`.

> Got the idea? Cool. Let's continue to more examples.

## How to export data from MySQL and pipe the `stream` to GCP's Cloud Storage or AWS S3

This example could save SQL query results to S3 or GCP Cloud Storage and no need to over provision memory resources.
In my scenario I would want to stream query results to my S3 datalake bucket and transform JSON into [ndJSON][6]. In this way I could easily trigger further data ingestion when file has been created in Cloud Storage.

To achieve this you would want to add a new **branch** to your `queryDbAndSave()` function:

~~~js
...
else if (output === 's3Stream') { // as one file, node.js streaming, save as new line delimited JSON.

    const uploadStream = ({ Bucket, Key }) => {
        const pass = new stream.PassThrough();
        return {
            writeStream: pass,
            promise: s3.upload({ Bucket, Key, Body: pass }).promise(),
        };
    };

    const { writeStream, promise } = uploadStream({ Bucket: bucket, Key: s3key });
    pr(`saving to aws s3 cp s3://${bucket}/${s3key} ./tmp/${s3key}`);

    s1.stream({ highWaterMark: BATCH_SIZE }) // stream() is just to wrap into pipeable object, and not to enable 'result' events, they are emitted anyway.
        // eslint-disable-next-line func-names
        .pipe(through2.obj(function(row, enc, next) {
            this.push(`${JSON.stringify(row)}\n`);
            next();
        },
        ))
        .pipe(writeStream)
        .on('close', () => {
            console.log('upload finished');
        });

    promise.then(() => {
        console.log('upload completed successfully');
        resolve(`saved to aws s3 cp s3://${bucket}/${s3key} ./tmp/${s3key}`);
    }).catch((err) => {
        console.log('upload failed.', err.message);
    });

}

~~~

This example will work for the same modules but you would want to include these ones too:
- `npm i aws-sdk@2.1001.0` the that's used in AWS Lambda environments at the moment of writing this article. Theck current evironments [here][7] so you could then simple exclude it from deployment artifacts.
- `through2@4.0.2"` a wrapper library making easier to construct `streams`.

So now if add another ***MySQL pipe*** to your `./config.json`:
~~~json
  {
    "Tables": [
      {
        "name" : "some_file_name_to_save_into",
        "sql"  : "SELECT *  FROM database_name.some_table where date = '2021-03-02';",
        "output": "local"
      },
      {
        "name" : "some_file_name_to_save_into2",
        "sql"  : "SELECT *  FROM database_name.some_table2 where date = '2021-03-02';",
        "output": "s3Stream"
      }
      
    ],
    "rds_host": "some.rds-host.eu-west-1.rds.amazonaws.com",
    "name": "root",
    "password": "your-password",
    "db_name": "database_name",
    "save_bucket": "data.your-bucket-name.aws",
    "key": "some_file_prefix_to_save_into/"
  }
~~~


> Run `$ npm run test` in your command line and it will export the data from MySQL and save it as one file in `stream` mode to your Cloud Storage.

## How export data as a `stream` and save it in chunks to Cloud Storage

You also might want to save data locally or to AWS S3 in chunks, i.e. in ***batch mode***. The snippet below explains how to do it.

You would want to declare an output file batch size in rows at the top of your `./app.js`: `const BATCH_SIZE = process.env.BATCH_SIZE || 3000;`
Then you would want to evaluate SQL query size. You could use another async function for that:

~~~js
const getSize = `${table.querySize}`; // This will get SQL query from `./config.json` to evaluate size of the final output.
const [rows] = await connection.execute(getSize);
~~~


Add another branch to your `queryDbAndSave()` function and export data in chunks each time checking if it's a time to finish:

~~~js
// Count processed rows and batches and compare it with TotlaRecords (which comes from getSize() function beforehand)
let recordsProcessed = 0;
let batchNumber = 1;
let batchRecords = [];
...
// save in batch mode:
else if (output === 's3') {
    s1.on('result', (row) => {
        ++recordsProcessed;
        batchRecords.push(row);

        if (recordsProcessed === (BATCH_SIZE * batchNumber) || recordsProcessed === totalRecords) {
            if (!dryRun) {
                connection.pause();
                pr(` batch ${batchNumber}, pushing to s3, ${batchRecords.length}, totalRecordsProcessed = ${recordsProcessed}`);

                // batch process here. saves in batch mode, split file into smaller files.
                const params = { Bucket: bucket, Key: s3key + batchNumber, Body: JSON.stringify(batchRecords) };

                // save chunk to s3
                s3.upload(params).promise()
                    .then(data => { connection.resume(); });
                pr(`saved ${batchNumber} to aws s3 cp s3://${bucket}/${s3key}${batchNumber} ./tmp/${s3key}${batchNumber}.csv`);
            }
            batchRecords = [];
            ++batchNumber;
        }
    });
    s1.on('end', () => { resolve(recordsProcessed); });
}
~~~

**Final solution for `processEvent()` function in `./app.js`:**
Don't forget to run `$npm i moment`. `./app.js` will use to construct file keys to save objects.

~~~js
...

const processEvent = async(event, tables, bucket, key) => {
    const now = moment();
    const datePrefix = now.format('YYYY/MM/DD/HH/');
    const minuteKey = now.format('mm').toString();

    const connection = await mysql.createConnection({
        host: config.get('roDb.host'),
        user: config.get('roDb.name'),
        password: config.get('roDb.password'),
        timezone: '+00:00',
    });

    for (const table of tables) {
        const veryBiqSqlResult = table.sql;

        // Use this to find the length of the Stream or no of objects
        // before you extract add querySize to your ./config.json file, i.e. "querySize": "select count(*) cnt, NOW() ts from schema.some_table_2;"
        const getSize = `${table.querySize}`;

        // const [rows] = await connection.execute(getSize, [1]);
        try {
            const [rows] = await connection.execute(getSize);
            const size = rows[0].cnt;
            const ts = rows[0].ts;
            console.log(`Query size : ${rows[0].cnt}, db NOW() : ${rows[0].ts}`);

            if (rows[0].cnt !== 0) {
                // construct file name to save into
                const s3key = `${key + table.name}/${datePrefix}${table.name}_${minuteKey}`;
                const result = await queryDbAndSave(connection, veryBiqSqlResult, size, ts, s3key, bucket, table.output, table.dryRun);

            } else if (rows[0].cnt === 0) {
                console.log(`Table ${table.name} : has no changes/results`);
            }
        } catch (e) {
            pr(e);
            console.log(`ERROR: ${e.code} ${e.sqlMessage}`);

        }
    }

    return pr({ 'Finished processing tables': `${tables.length}` });
}
;

const queryDbAndSave = async(connection, sql, totalRecords, ts, s3key, bucket, output = 'local', dryRun = false) => {
    return new Promise((resolve, reject) => {

        let recordsProcessed = 0;
        let batchNumber = 1;
        let batchRecords = [];

        // const s1 = connection.connection.query(sql, [ts]);
        const s1 = connection.connection.query(sql);

        if (output === 'local') {
            const outputStream = fs.createWriteStream('output.csv', { encoding: 'utf8' });
            s1.stream({ highWaterMark: BATCH_SIZE }) // stream() is just to wrap into pipeable object, and not to enable 'result' events, they are emitted anyway.
                .pipe(csvstringify({ header: true }))
                .pipe(outputStream)
                .on('finish', () => { resolve('saved data locally'); });

        } else if (output === 's3') {
            s1.on('result', (row) => {
                ++recordsProcessed;
                batchRecords.push(row);

                if (recordsProcessed === (BATCH_SIZE * batchNumber) || recordsProcessed === totalRecords) {
                    if (!dryRun) {
                        connection.pause();
                        pr(` batch ${batchNumber}, pushing to s3, ${batchRecords.length}, totalRecordsProcessed = ${recordsProcessed}`);

                        // batch process here. saves in batch mode, split file into smaller files.
                        const params = { Bucket: bucket, Key: s3key + batchNumber, Body: JSON.stringify(batchRecords) };

                        // eslint-disable-next-line promise/catch-or-return
                        s3.upload(params).promise()
                            .then(data => { connection.resume(); });
                        pr(`saved ${batchNumber} to aws s3 cp s3://${bucket}/${s3key}${batchNumber} ./tmp/${s3key}${batchNumber}.csv`);
                    }
                    batchRecords = [];
                    ++batchNumber;
                }
            });
            s1.on('end', () => { resolve(recordsProcessed); });
        } else if (output === 's3Stream') { // as one file, node.js streaming, save as new line delimited JSON.

            const uploadStream = ({ Bucket, Key }) => {
                const pass = new stream.PassThrough();
                return {
                    writeStream: pass,
                    promise: s3.upload({ Bucket, Key, Body: pass }).promise(),
                };
            };

            const { writeStream, promise } = uploadStream({ Bucket: bucket, Key: s3key });
            pr(`saving to aws s3 cp s3://${bucket}/${s3key} ./tmp/${s3key}`);

            s1.stream({ highWaterMark: BATCH_SIZE }) // stream() is just to wrap into pipeable object, and not to enable 'result' events, they are emitted anyway.
                // eslint-disable-next-line func-names
                .pipe(through2.obj(function(row, enc, next) {
                    this.push(`${JSON.stringify(row)}\n`);
                    next();
                },
                ))
                .pipe(writeStream)
                .on('close', () => {
                    console.log('upload finished');
                });

            promise.then(() => {
                console.log('upload completed successfully');
                resolve(`saved to aws s3 cp s3://${bucket}/${s3key} ./tmp/${s3key}`);
            }).catch((err) => {
                console.log('upload failed.', err.message);
            });

        }

        s1.on('error', (error) => {
            connection.destroy();
            reject(error);
        });
    });

};
~~~


## How to use yaml config

The final solution which can be found in this [repository][8] use `npm config` and `yaml` definitions. I prefer using `yaml` simply because it is easier to read and add those long SQL queries.

Sample `./config/staging.yaml` would usually look:
~~~yaml
Tables:
  -
    name: some_table_1
    bigqueryName: some_alt_table_name_1
    sql:
        - > 
            SELECT 
                * 
            FROM
                schema.some_table_1
            limit 10;
    querySize: select count(*) cnt, NOW() ts from scheam.some_table_1 ;
    output: s3
    dryRun: false
    disabled: false
    notes: daily.

~~~

It is also more intuitive in my opinion to separate between `live` and `staging` environments using it. In your command line run `$ npm i config`. So your final application folder with `./config/` instead `./config.json` would look like:

~~~sh
.
├── config
│   ├── default.yaml
│   ├── production.yaml
│   └── staging.yaml
├── test
│   └── data.json
├── tmp
├── app.js
├── deploy.sh
├── package.json
└── readme.md
~~~

## How to deploy the solution
There are three ways to do it.
1. Beginners would probably choose to use web UI either deploy the solution as **AWS Lambda** or **GCP Cloud function**
2. `./deploy.sh` script like this one below. Run `$ ./deploy.sh` in your command line and it will deploy a Lambda:
    ~~~sh
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
        --description "Extracts MySQL data and saves to S3" \
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
    ~~~
3. Deploy using **Infrastructure as code** with either Tarraform or AWS Cloudformation. Handy AWS Cloudformation template can be found in this project's repository on github.

During the deployment make sure you configured all access **roles** and **Security groups** properly. For example, when your MySQL database is in AWS then your Lambda function must be deployed in the same VPC to be able to access it. Once you enable VPC support in Lambda your function no longer has access to anything outside your VPC, which includes S3. With S3 specifically you can use [VPC Endpoints][15] to resolve this.


## Conclusion

This is a simple and reliable data export solution which allows you to extract data from **MySQL database** with some awesome features:
- Extract MySQL data programmatically by just running `$npm run test` from your command line.
- Use `yaml` definitions to describe your ***MySQL pipes***.
- Perform `dryRun` to evaluate SQL size.
- Export data with `Node.js streams` to avoid memory over provisioning.
- Save data exports on your local device.
- Save data to the **Cloud** as one file or in chunks.
Check [Github repository](https://github.com/mshakhomirov/pipelinetools) for more information.

Some real-time [integrations][8] might be expensive and often it depnds on the size of the data you have. Just imagine each row inserted into MySQL would trigger the Lambda to export and insert it into your data warehouse. There is a better way to monitor and control data ingestion like that.

Jus a few days ago I used it to export 56 million of rows from MySQL. Then I saved them in chunks to my data lake in **AWS S3**. For example, I have a BigQuery data loading manager connected to this bucket I wrote about in this post:
https://towardsdatascience.com/how-to-handle-data-loading-in-bigquery-with-serverless-ingest-manager-and-node-js-4f99fba92436

So exporting my MySQL data into the data warehouse was quick and easy.




[1]: https://towardsdatascience.com/how-to-handle-data-loading-in-bigquery-with-serverless-ingest-manager-and-node-js-4f99fba92436
[2]: https://dev.mysql.com/doc/refman/5.7/en/select-into.html
[3]: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraMySQL.Integrating.SaveIntoS3.html
[4]: https://www.npmjs.com/package/mysql2
[5]: https://nodejs.org/api/stream.html
[6]: http://ndjson.org/
[7]: https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
[8]: https://aws.amazon.com/blogs/database/capturing-data-changes-in-amazon-aurora-using-aws-lambda/
[9]: https://stackoverflow.com/questions/12333260/export-a-mysql-table-with-hundreds-of-millions-of-records-in-chunks
[10]: https://stackoverflow.com/questions/1119312/mysql-export-into-outfile-csv-escaping-chars/1197023
[11]: https://joshuaotwell.com/select-into-outfile-examples-in-mysql/
[12]: https://github.com/sidorares/node-mysql2/issues/677
[13]: https://aws.amazon.com/blogs/database/best-practices-for-exporting-and-importing-data-from-amazon-aurora-mysql-to-amazon-s3/
[14]: https://blog.risingstack.com/node-js-mysql-example-handling-hundred-gigabytes-of-data/


## How not to do it
[14]: https://stackoverflow.com/questions/31063258/using-the-mysql-module-in-node-js-for-large-tables 
[15]: https://stackoverflow.com/questions/34180448/mysql-retrieve-a-large-select-by-chunks