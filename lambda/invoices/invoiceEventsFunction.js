const { ApiGatewayManagementApi } = require('aws-sdk');
const AWS = require('aws-sdk');
const AWSXray = require('aws-xray-sdk-core');

const xRay = AWSXray.captureAWS(require('aws-sdk'));

const awsRegion = process.env.AWS_REGION;
const eventsDdb = process.env.EVENTS_DDB;

const invoiceWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT.substring(6);

AWS.config.update({
  region: awsRegion,
});

const ddbClient = new AWS.DynamoDB.DocumentClient();

const apigwManagementApi = new ApiGatewayManagementApi({
  apiVersion: '2018-11-29',
  endpoint: invoiceWsApiEndpoint,
});

exports.handler = async function (event, context) {
  // TODO - to be removed
  console.log(event);

  const promises = [];

  for (let index = 0; index < event.Records.length; index++) {
    const record = event.Records[index];
    //TODO - to be removed
    console.log(record);

    if (record.eventName === 'INSERT') {
      if (record.dynamodb.NewImage.pk.S.startsWith('#transaction')) {
        console.log('Invoice transaction event received');
      } else {
        console.log('Invoice event received');
        promises.push(createEvent(record.dynamodb.NewImage, 'INVOICE_CREATED'));
      }
    } else if (record.eventName === 'MODIFY') {
      console.log('Event: MODIFY');
    } else if (record.eventName === 'REMOVE') {
      //TODO - invoice transaction timeout
      if (record.dynamodb.OldImage.pk.S === '#transaction') {
        console.log('Invoice transaction timeout event received');

        const transactionId = record.dynamodb.OldImage.sk.S;
        const connectionId = record.dynamodb.OldImage.connectionId.S;

        console.log(`TransactionId: ${transactionId} - ConnectionId: ${connectionId}`);
        if (record.dynamodb.OldImage.transactionStatus.S === 'INVOICE_PROCESSED') {
          console.log('Invoice processed');
        } else {
          console.log('Invoice import failed - timeout / error');
          await sendInvoiceStatus(transactionId, connectionId, 'TIMEOUT');
        }
        promises.push(disconnectClient(connectionId));
      }
    }
  }
  await Promise.all(promises);

  return {};
};

async function disconnectClient(connectionId) {
  try {
    const params = {
      ConnectionId: connectionId,
    };
    await apigwManagementApi.getConnection(params).promise();
    return apigwManagementApi.deleteConnection(params).promise();
  } catch (err) {
    console.log(err);
  }
}

async function sendInvoiceStatus(transactionId, connectionId, status) {
  try {
    const params = {
      ConnectionId: connectionId,
    };
    await apigwManagementApi.getConnection(params).promise();

    const postData = JSON.stringify({
      key: transactionId,
      status: status,
    });
    return apigwManagementApi
      .postToConnection({
        ConnectionId: connectionId,
        Data: postData,
      })
      .promise();
  } catch (err) {
    console.log(err);
  }
}

function createEvent(invoiceEvent, eventType) {
  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000 + 60 * 60);

  const params = {
    TableName: eventsDdb,
    Item: {
      pk: `#invoice_${invoiceEvent.sk.S}`,
      sk: `${eventType}#${timestamp}`,
      ttl: ttl,
      email: invoiceEvent.pk.S.split('_')[1],
      createdAt: timestamp,
      eventType: eventType,
      info: {
        transactionId: invoiceEvent.transactionId.S,
        productId: invoiceEvent.productId.S,
      },
    },
  };
  return ddbClient.put(params).promise();
}
