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
  const promises = [];

  throw 'Non valid event type';
  /*   //TODO - to be removed
  //impri um log o que esta acontecendo no eventp nao é usual

  //lista de registros onde a funcao foi chamada
  event.Records.forEach((record) => {
    //TODO - to be removed
    //impri um log o que esta acontecendo no record
    // console.log(record);

    //cria o evento na tabela do dynamo
    promises.push(createEvent(record.Sns));
  });
  await Promise.all(promises);
  return {}; */
};

function createEvent(body) {
  const envelope = JSON.parse(body.Message);
  const event = JSON.parse(envelope.data);

  console.log(`Creating order event - MessageId: ${body.MessageId}`);

  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000 + 120 * 60); // 120 minutes ahead, in seconds
  const params = {
    TableName: eventsDdb,
    Item: {
      pk: `#order_${event.orderId}`,
      sk: `${envelope.eventType}#${timestamp}`, //ORDER_CREATED#12321
      ttl: ttl,
      email: event.email,
      createAt: timestamp,
      requestId: event.requestId,
      eventType: envelope.eventType,
      info: {
        orderId: event.orderId,
        productCodes: event.productCodes,
        MessageId: body.MessageId,
      },
    },
  };
  return ddbClient.put(params).promise();
}
