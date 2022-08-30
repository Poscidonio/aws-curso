const AWS = require('aws-sdk');
const AWSXray = require('aws-xray-sdk-core');

const xRay = AWSXray.captureAWS(require('aws-sdk'));
const awsRegion = process.env.AWS_REGION;

AWS.config.update({
  region: awsRegion,
});
const sesClient = new AWS.SES({ apiVersion: '2010-12-01' });
exports.handler = async function (event, context) {
  console.log('Order event');
  const promises = [];

  event.Records.forEach((record) => {
    const body = JSON.parse(record.body);
    promises.push(sendOrderEmail(body));
    console.log(body);
  });
  return {};
};

function sendOrderEmail(body) {
  const envelope = JSON.parse(body.Message);
  const event = JSON.parse(envelope.data);

  const params = {
    Destination: {
      ToAdresses: [event.email],
    },
    Message: {
      Body: {
        Text: {
          Charset: 'UTF-8',
          Data: `Recebemos seu pedido de numero ${event.orderId}, mo valor de R$ ${event.billinng.totalPrice}.`,
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: 'Recebemos seu pedido!',
      },
    },
    Source: 'guilhermeposcidonio@gmail.com',
    ReplyToAddresses: ['guilhermeposcidonio@gmail'],
  };
  return sesClient.sendEmail(params).promise();
}
