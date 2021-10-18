
/* eslint-disable arrow-body-style */
/* eslint-disable no-use-before-define */

const DEBUG = process.env.DEBUG || 'false';
const NODE_ENV = process.env.NODE_ENV || 'staging';
const TESTING = process.env.TESTING || 'true';

// eslint-disable-next-line no-magic-numbers
const BATCH_SIZE = process.env.BATCH_SIZE || 3000;

const mysql = require('mysql2/promise');
const moment = require('moment');
const AWS = require('aws-sdk');
AWS.config.update({ region: 'eu-west-1' });
const s3 = new AWS.S3();
const csvstringify = require('csv-stringify');
const fs = require('fs');
const stream = require('stream');
const through2 = require('through2');

// Local dependencies
// When deployed to AWS TESTING must be set to 'false'
if (TESTING === 'false') {
    process.env.NODE_CONFIG_DIR = '/var/task/bq-mysql-pipeName/config';
}
const config = require('config');
const pr = (txt) => { if (DEBUG === 'true') { console.log(txt); } };

exports.handler = async(event, context) => {

    console.log('Now: ', moment());
    try {

        const tables = config.get('Tables');
        const bucket = config.get('saveTo.bucket');
        const key = config.get('saveTo.key');
        pr(`NODE_ENV: ${NODE_ENV}`);

        const data = await processEvent(event, tables, bucket, key);
        context.succeed(data);
    } catch (e) {
        console.log(e);
        context.done(e);
    }
};

const processEvent = async(event, tables, bucket, key) => {
    const now = moment();
    const datePrefix = now.format('YYYY/MM/DD/HH/');
    const minuteKey = now.format('mm').toString();
    pr(`datePrefix: ${datePrefix} minuteKey: ${minuteKey}`);

    const endDate = moment().subtract({ hours: 24, minutes: 0 }).format('YYYY-MM-DDT00:00:00-0000');
    const startDate = moment().subtract({ hours: 48, minutes: 0 }).format('YYYY-MM-DDT00:00:00-0000');

    pr(`startDate: ${startDate} <> endDate: ${endDate}`);

    const connection = await mysql.createConnection({
        host: config.get('roDb.host'),
        user: config.get('roDb.name'),
        password: config.get('roDb.password'),
        timezone: '+00:00',
    });

    for (const table of tables) {
        if (!table.disabled) {
            const veryBiqSqlResult = table.sql;
            pr({ 'sql': `${table.sql}` });
            pr(`sql: ${table.sql}`);

            // Use this to find the length of the Stream or no of objects
            // before you extract

            const getSize = `${table.querySize}`;

            // const [rows] = await connection.execute(getSize, [1]);
            try {
                const [rows] = await connection.execute(getSize);
                const size = rows[0].cnt;
                const ts = rows[0].ts;
                pr(`Query size : ${rows[0].cnt}, db NOW() : ${rows[0].ts}`);

                if (rows[0].cnt !== 0) {
                    const s3key = `${key + table.name}/${datePrefix}${table.name}_${minuteKey}`;
                    const result = await queryDbAndSave(connection, veryBiqSqlResult, size, ts, s3key, bucket, table.output, table.dryRun);

                    pr({ 'Saving data from pipe': `${table.name}` });
                    pr({ 'Successfully saved data to': `${(table.output.includes('s3')) ? 's3' : './tmp/'}` });
                    pr({ 'result': `${result}` });

                } else if (rows[0].cnt === 0) {
                    console.log(`Table ${table.name} : has no changes/results`);
                    pr(`Table: ${table.name} has no changes/ new data `);
                }
            } catch (e) {
                pr(e);
                console.log(`ERROR: ${e.code} ${e.sqlMessage}`);

            }
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
