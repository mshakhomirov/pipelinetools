const DEBUG  = process.env.DEBUG;
const BUCKET_TEST = process.env.DB_BUCKET_TEST || "data-staging.your-bucket.aws";
const BUCKET = process.env.DB_BUCKET || "data.your-bucket.aws";
const KEY    = process.env.DB_KEY || "reconcile/";
const TESTING = process.env.TESTING || 'true';

const AWS = require('aws-sdk');
AWS.config.update({ region: "eu-west-1"});
const s3  = new AWS.S3();

// 3rd party dependencies
const axios = require('axios');
const paypal = axios.create({
    baseURL: (TESTING==='true') ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com' 
  });
const moment    = require('moment');

// Config
const config = require('./config.json');
const tokenConfig = require('./token_config.json');


let pr = txt => { if (DEBUG) console.log(txt) };

exports.handler = async (event, context) => {
    pr("app.handler invoked with event "+ JSON.stringify(event,null,2));
    try {
        pr(`TESTING? : ${TESTING} ${typeof TESTING}`);
        
        let [bucket,tables] =  [ (TESTING==='true') ? BUCKET_TEST : BUCKET , (TESTING==='true') ? config.Staging.Tables : config.Production.Tables];
        pr(`BUCKET : ${bucket} TABLES: ${tables}`);
        
        // let access_token = `Bearer A****B` //replace A****B with your token in staging.
        let access_token = `Bearer ` + await getToken(tokenConfig.config);

        paypal.defaults.headers.common['Authorization'] = access_token;

        if (TESTING==='false') {
            let access_token = `Bearer ` + await getToken(tokenConfig.config);
            paypal.defaults.headers.common['Authorization'] = access_token;
        }

        context.succeed( await processEvent(event,tables,bucket) );
    } catch (e) {
        console.log("Error: "+JSON.stringify(e));
        context.done(e)
    }
};

let processEvent = async (event,tables,bucket) => {
    let now = moment(); 
    let datePrefix = now.format("YYYY/MM/DD/HH/");
    let fileKey = now.format("mm").toString();
    pr(`datePrefix: ${datePrefix} fileKey: ${fileKey}`);

    let end_dt = moment().subtract({ hours: 24, minutes: 0}).format("YYYY-MM-DDT00:00:00-0000");
    let start_dt = moment().subtract({ hours: 48, minutes: 0}).format("YYYY-MM-DDT00:00:00-0000");
    
    pr(`start_dt: ${start_dt} <> end_dt: ${end_dt}`)

    let options = {

        url: '/v1/reporting/transactions',
        params: {
            start_date: start_dt,
            end_date: end_dt, 
            fields: 'all',
            page_size: 500,
        }
    }

    try {

        for (const table of tables) {
            let pages = await getSize(options.url, options);
            for (const page of Array(pages).keys()   ) {
                options.params.page = page+1;
                let rows = await getTransactionData(options.url, options);
                pr(`page: ${options.params.page} has ${rows.length}`)
                pr(`Extracting from PayPal for [table:${table.name}] and saving to [s3:${bucket}]`);
                let params = {
                    Bucket: bucket,
                    Key: KEY + table.name + '/' + datePrefix + table.name + fileKey + options.params.page,
                    Body: JSON.stringify(rows)
                };

                if (rows.length > 0) {
                    await s3.putObject(params).promise();
                    pr(`>> ${rows.length} rows from [table:${table.name}] have been saved to  [s3:${bucket} / ${JSON.stringify(params.Key)}]`);
        
                }
                else{
                    pr(`>> ${rows.length} rows from [table:${table.name}]. Didn't create an object @ [s3:${bucket} / ${JSON.stringify(params.Key)}]`);
                }

            }

        }

    } catch (error) {
        console.log('error: ', error);
    }

    return bucket;

};

async function getTransactionData(url,config) {
    try {
        const response = await paypal.get(url,config);
        pr(`>> [getTransactionData] [total_pages]: ${response.data}` );
        
        return response.data.transaction_details;
    } catch (error) {
      console.error(error);
    }
}
;

async function getSize(url,config) {
    try {
        const response = await paypal.get(url,config);
        pr(`>> [getTransactionData] [total_pages]: ${response.data.total_pages}` );
        return response.data.total_pages;
    } catch (error) {
      console.error(error);
    }
}
;

async function getToken(config) {
    try {
        config.url = (TESTING==='true') ? 'https://api-m.sandbox.paypal.com/v1/oauth2/token' : 'https://api-m.paypal.com/v1/oauth2/token';
        // config.user = (TESTING==='true') ? config.client_secret_staging : config.client_secret_production;
        console.log(JSON.stringify(config));
        const response = await axios.request(config);

        return response.data.access_token;
    } catch (error) {
        console.error(error);
    }
}
;

async function getGetToken(tokenConfig) {
    try {
        let headers = {
            'Accept': 'application/json',
            'Accept-Language': 'en_US'
        };
        let dataString = 'grant_type=client_credentials';

        let options = {
            url: 'https://api-m.sandbox.paypal.com/v1/oauth2/token',
            method: 'POST',
            headers: headers,
            body: dataString,
            auth: {
                'user': 'client_id',
                'pass': 'secret'
            }
        };
        config.method = 'POST';
        config.headers = headers;
        config.url = (TESTING==='true') ? 'https://api-m.sandbox.paypal.com/v1/oauth2/token' : 'https://api-m.paypal.com/v1/oauth2/token';
        config.user = (TESTING==='true') ? tokenConfig.client_secret_staging : tokenConfig.client_secret_production;
        config.data = "grant_type=client_credentials";
        console.log(JSON.stringify(config));
        const response = await axios.request(config);
        // const response = await axios.request(options);

        return response.data.access_token;
    } catch (error) {
        console.error(error);
    }
}
