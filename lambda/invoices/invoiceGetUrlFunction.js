const { ApiGatewayManagementApi } = require('aws-sdk');
const AWS = require('aws-sdk');
const AWSXray = require('aws-xray-sdk-core');
const uuid = require('uuid');

const xRay = AWSXray.captureAWS(require('aws-sdk'));

const awsRegion = process.env.AWS_REGION;
const invoicesDdb = process.env.INVOICES_DDB;
const bucketName = process.env.BUCKET_NAME;
const invoiceWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT.substring(6);

AWS.config.update({
  region: awsRegion,
});

const ddbClient = new AWS.DynamoDB.DocumentClient();
const s3Client = new AWS.S3({
  region: awsRegion,
});
const apigwManagementApi = new ApiGatewayManagementApi({
  apiVersion: '2018-11-29',
  endpoint: invoiceWsApiEndpoint,
});

exports.handler = async function (event, context) {
  //TODO - to be removed
  console.log(event);

  const lambdaRequestId = context.awsRequestId;
  const connectionId = event.requestContext.connectionId;

  console.log(`ConnectionId: ${connectionId} - Lambda RequestId: ${lambdaRequestId}`);

  const expires = 300;
  const key = uuid.v4();
  const params = {
    Bucket: bucketName,
    Key: key,
    Expires: expires,
  };
  const signedUrl = await s3Client.getSignedUrl('putObject', params);

  const postData = JSON.stringify({
    url: signedUrl,
    expires: expires,
    transactionId: key,
  });

  await createInvoiceTransaction(key, lambdaRequestId, expires, connectionId, invoiceWsApiEndpoint);
  await apigwManagementApi
    .postToConnection({
      ConnectionId: connectionId,
      Data: postData,
    })
    .promise();
  return {};
};

function createInvoiceTransaction(key, lambdaRequestId, expires, connectionId, invoiceWsApiEndpoint) {
  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000 + 2 * 60);

  const params = {
    TableName: invoicesDdb,
    Item: {
      pk: '#transaction',
      sk: key,
      ttl: ttl,
      requestId: lambdaRequestId,
      transactionStatus: 'URL_GENERATED',
      timestamp: timestamp,
      expires: expires,
      connectionId: connectionId,
      endpoint: invoiceWsApiEndpoint,
    },
  };
  return ddbClient.put(params).promise();
}
