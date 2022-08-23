//acessa a tabela no dynamodb
const AWS = require('aws-sdk');
const AWSXray = require('aws-xray-sdk-core');
const {
  createVariableStatement,
  createImmediatelyInvokedFunctionExpression,
} = require('typescript');

const xRay = AWSXray.captureAWS(require('aws-sdk'));

const eventsDdb = process.env.EVENTS_DDB;
const awsRegion = process.env.AWS_REGION;

AWS.config.update({
  region: awsRegion,
});

const ddbClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async function (event, context) {
  console.log(event);

  await createEvent(event.productEvent);

  context.succeed(
    JSON.stringify({
      productEventCreated: true,
      message: 'OK',
    })
  );
};

function createEvent(productEvent) {
  {
    const timestamp = Date.now();
    const ttl = ~~(timestamp / 1000 + 5 * 60); // o ttl ira durar 5 minutos apos a execucao
    const params = {
      TableName: eventsDdb,
      Item: {
        pk: `#product_${productEvent.productCode}`,
        sk: `${productEvent.eventType}#${timestamp}`,
        ttl: ttl,
        email: productEvent.email,
        createdAt: timestamp,
        requestId: productEvent.requestId,
        eventType: productEvent.eventType,
        info: {
          productId: productEvent.productId,
          price: productEvent.productPrice,
        },
      },
    };
    return ddbClient.put(params).promise();
  }
}
