//acessa a tabela no dynamodb
const AWS = require('aws-sdk');
const AWSXray = require('aws-xray-sdk-core');
const { send } = require('process');
const uuid = require('uuid');

const xRay = AWSXray.captureAWS(require('aws-sdk'));
const productsDdb = process.env.PRODUCTS_DDB;
const awsRegion = process.env.AWS_REGION;
const productEventsFunctionName = process.env.PRODUCT_EVENTS_FUNCTION_NAME;

AWS.config.update({
  region: awsRegion,
});

const ddbClient = new AWS.DynamoDB.DocumentClient();
const lambdaClient = new AWS.Lambda();

exports.handler = async function (event, context) {
  const method = event.httpMethod;

  const apiRequestId = event.requestContext.requestId;
  const lambdaRequestId = context.awsRequestId;

  console.log(
    `API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`
  );

  //GET / products / operacoes que serao executadas
  if (event.resource === '/products') {
    if (method === 'GET') {
      //GET /products
      const data = await getAllProducts(); //espera ser executado a funcao

      return {
        statusCode: 200,
        body: JSON.stringify(data.Items),
      };
    } else if (method === 'POST') {
      //post /products
      const product = JSON.parse(event.body);
      product.id = uuid.v4();

      await createProduct(product);

      const result = await sendProductEvent(
        product,
        'PRODUCT_CREATED',
        'guilhermeaugusto@cooxupe.com.br',
        lambdaRequestId
      );
      console.log(result);

      return {
        statusCode: 201,
        body: JSON.stringify(product),
      };
    }
  } else if (event.resource === '/products/{id}') {
    const productId = event.pathParameters.id;
    if (method === 'GET') {
      //GET /products/{id}
      const data = await getProductById(productId);
      if (data.Item) {
        return {
          statusCode: 200,
          body: JSON.stringify(data.Item),
        };
      } else {
        return {
          statusCode: 404,
          body: JSON.stringify(`Product with ID ${productId} not found`),
        };
      }
    } else if (method === 'PUT') {
      //PUT /products/{id} atualiza
      const data = await getProductById(productId);
      if (data.Item) {
        const product = JSON.parse(event.body);
        await updateProduct(productId, product);

        const result = await sendProductEvent(
          product,
          'PRODUCT_UPDATED',
          'guilhermeaugusto@cooxupe.com.br',
          lambdaRequestId
        );

        return {
          statusCode: 200,
          body: JSON.stringify(product),
        };
      } else {
        return {
          statusCode: 404,
          body: JSON.stringify(`Product with id ${productId}  not found`),
        };
      }
    } else if (method === 'DELETE') {
      //DELETE /products/{id}
      //busca no banco e espera
      const data = await getProductById(productId);
      if (data.Item) {
        //deleta do banco
        const deletePromise = deleteProduct(productId);
        //gera o evento
        const sendEventPromise = sendProductEvent(
          data.Item,
          'PRODUCT_DELETED',
          'guilhermeaugusto@cooxupe.com.br',
          lambdaRequestId
        );
        //faz com que o deleted e o event seja gerado sincrono e esperando ambos serem executados
        const result = await Promise.all([deletePromise, sendEventPromise]);
        console.log(result[1]);

        return {
          statusCode: 200,
          body: JSON.stringify(data.Item),
        };
      } else {
        return {
          statusCode: 404,
          body: JSON.stringify(`Product with id ${productId}  not found`),
        };
      }
    }
  }

  return {
    statusCode: 400,
    body: JSON.stringify({
      message: 'Bad request',
      apiGwRequestId: apiRequestId,
      lambdaRequestId: lambdaRequestId,
    }),
  };
};

function sendProductEvent(product, event, email, lambdaRequestId) {
  const params = {
    FunctionName: productEventsFunctionName,
    InvocationType: 'Event', // async
    Payload: JSON.stringify({
      productEvent: {
        requestId: lambdaRequestId,
        eventType: event,
        productId: product.id,
        productCode: product.code,
        productPrice: product.price,
        email: email,
      },
    }),
  };

  return lambdaClient.invoke(params).promise();
}

function getAllProducts() {
  const params = {
    TableName: productsDdb,
  };
  //scan varre a tabela inteira de acordo com o criterio selecionado sem parametros tras toda a tabela
  return ddbClient.scan(params).promise(); //utilizado para funcao esperar ate ter a resposta
}

function getProductById(productId) {
  const params = {
    TableName: productsDdb,
    Key: {
      id: productId,
    },
  };
  return ddbClient.get(params).promise();
}

function createProduct(product) {
  const params = {
    TableName: productsDdb,
    Item: {
      id: product.id,
      productName: product.productName,
      code: product.code,
      price: product.price,
      model: product.model,
    },
  };
  return ddbClient.put(params).promise();
}

function updateProduct(productId, product) {
  const params = {
    TableName: productsDdb,
    Key: {
      id: productId,
    },
    UpdateExpression: 'set productName = :n, code = :c, price = :p, model = :m',
    ExpressionAttributeValues: {
      ':n': product.productName,
      ':c': product.code,
      ':p': product.price,
      ':m': product.model,
    },
  };
  return ddbClient.update(params).promise();
}

function updateProductPrice(productId, product) {
  const params = {
    TableName: productsDdb,
    Key: {
      id: productId,
    },
    updateExpression: 'set price = :p',
    ExpressionAtributeValues: {
      ':p': product.price,
    },
  };
  return ddbClient.update(params).promise();
}

function deleteProduct(productId) {
  const params = {
    TableName: productsDdb,
    Key: {
      id: productId,
    },
  };
  return ddbClient.delete(params).promise();
}
