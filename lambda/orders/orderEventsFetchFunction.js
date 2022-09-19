const AWS = require('aws-sdk');
const AWSXray = require('aws-xray-sdk-core');

const xRay = AWSXray.captureAWS(require('aws-sdk'));

const awsRegion = process.env.AWS_REGION;
//cria a tabela de eventos
const eventsDdb = process.env.EVENTS_DDB;

AWS.config.update({
  region: awsRegion,
});

const ddbClient = new AWS.DynamoDB.DocumentClient();
//funcao assincrona que retornara o evento e um contexto
exports.handler = async function (event, context) {
  const method = event.httpMethod;

  const apiRequestId = event.requestContext.requestId;
  const lambdaRequestId = context.awsRequestId;

  console.log(`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`);
  if (event.resource === '/orders/events') {
    const email = event.queryStringParameters.email;
    const eventType = event.queryStringParameters.eventType;

    if (method === 'GET') {
      if (email & eventType) {
        const data = await getOrderEventsByEmailAndEventType(email, eventType);
        return {
          statusCode: 200,
          body: JSON.stringify(convertOrderEvents(data.Items)),
        };
      } else if (email) {
        const data = await getOrderEventsByEmail(email);
        return {
          statusCode: 200,
          body: JSON.stringify(convertOrderEvents(data.Items)),
        };
      }
    }
  }
  return {
    statusCode: 400,
    body: JSON.stringify('Bad request'),
  };
};
function convertOrderEvents(Items) {
  return Items.map((item) => {
    return {
      email: item.email,
      createAt: item.createAt,
      eventType: item.eventType,
      request: item.requestId,
      orderId: item.info.orderId,
      productCodes: item.info.productCodes,
    };
  });
}
function getOrderEventsByEmail(email) {
  const params = {
    TableName: eventsDdb,
    IndexName: 'emailIdx',
    KeyConditionExpression: 'email = :email AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: {
      ':email': email,
      prefix: 'ORDER_',
    },
  };
  return ddbClient.get(params).promise();
}

function getOrderEventsByEmailAndEventType(email, eventType) {
  const params = {
    TableName: eventsDdb,
    IndexName: 'emailIdx',
    KeyConditionExpression: 'email = :email AND begins_with(sk, :eventType)',
    ExpressionAttributeValues: {
      ':email': email,
      eventType: eventType,
    },
  };
  return ddbClient.get(params).promise();
}
