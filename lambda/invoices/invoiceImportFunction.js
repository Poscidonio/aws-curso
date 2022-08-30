const { ApiGatewayManagementApi } = require('aws-sdk');
const AWS = require('aws-sdk');
const AWSXray = require('aws-xray-sdk-core');

const xRay = AWSXray.captureAWS(require('aws-sdk'));

const awsRegion = process.env.AWS_REGION;
const invoicesDdb = process.env.INVOICES_DDB;
const invoiceWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPONT;

AWS.config.update({
  region: awsRegion,
});

const ddbClient = new AWS.DynamoDB.DocumentClient();
const s3Client = new AWS.s3({
  region: awsRegion,
});
const apigwManagementApi = new ApiGatewayManagementApi({
  apiVersion: '2018-11-29',
  endpoint: invoiceWsApiEndpoint,
});

exports.handler = async function (event, context) {
  //TODO - to be removed
  console.log(event.Records[0].s3);

  const key = event.Records[0].s3.object.key;
  const params = {
    Key: key,
    Bucket: event.Records[0].s3.bucket.name,
  };
};
