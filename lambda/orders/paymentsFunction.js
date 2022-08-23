const AWS = require('aws-sdk');
const AWSXray = require('aws-xray-sdk-core');

const xRay = AWSXray.captureAWS(require('aws-sdk'));

exports.handler = async function (event, context) {
  console.log(event.Records[0]);
  return {};
};
