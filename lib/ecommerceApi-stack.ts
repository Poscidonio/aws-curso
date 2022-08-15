import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

interface ECommerceApiStackProps extends cdk.StackProps {
  productsHandler: lambdaNodeJS.NodejsFunction;
  ordersHandler: lambdaNodeJS.NodejsFunction;
}
//implementacao da pilha
export class ECommerceApiStack extends cdk.Stack {
  //stack principal / props sao as propriedades
  constructor(scope: Construct, id: string, props: ECommerceApiStackProps) {
    super(scope, id, props);

    const apiGW = new apigateway.RestApi(this, 'ecommerce-api', {
      restApiName: 'Ecommerce Service',
      description: 'This is the Ecommerce service',
    });

    const productsFunctionIntegration = new apigateway.LambdaIntegration(
      props.productsHandler
    );
    //opercao implementadas recursos
    const productsResource = apiGW.root.addResource('products');
    //GET /products / busca todo os produtos
    productsResource.addMethod('GET', productsFunctionIntegration);
    //POST /products / insere em produtos
    productsResource.addMethod('POST', productsFunctionIntegration);
    //GET /products/{id} / busca o produto por id
    //armazena o id para realizar demais operacoes
    const productIdResource = productsResource.addResource('{id}');
    productIdResource.addMethod('GET', productsFunctionIntegration);
    //PUT /products/{id} / altera produto por id
    productIdResource.addMethod('PUT', productsFunctionIntegration);
    //DELETE /prodcts/{id} / deleta o produto por id
    productIdResource.addMethod('DELETE', productsFunctionIntegration);

    const ordersFunctionIntegration = new apigateway.LambdaIntegration(
      props.ordersHandler
    );

    //orders
    const ordersResource = apiGW.root.addResource('orders');

    //GET / orders
    //GET / orders?email=guilhermeaugusto@cooxupe.com.br
    //GET / orders?email=guilhermeaugusto@cooxupe.com.br&orderId=123
    ordersResource.addMethod('GET', ordersFunctionIntegration);

    //DELETE /orders?email=guilhermeaugusto@cooxupe.com.br&orderId=123
    ordersResource.addMethod('DELETE', ordersFunctionIntegration);

    //POST / orders
    ordersResource.addMethod('POST', ordersFunctionIntegration);
  }
}