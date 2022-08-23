import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { ImagePullPrincipalType } from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';

interface ProductsFunctionStackProps extends cdk.StackProps {
  productsDdb: dynamodb.Table;
  eventsDdb: dynamodb.Table;
}
export class ProductsFunctionStack extends cdk.Stack {
  readonly productsHandler: lambdaNodeJS.NodejsFunction;

  constructor(scope: Construct, id: string, props: ProductsFunctionStackProps) {
    super(scope, id, props);
    const productsEventsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'ProductEventsFunction',
      {
        functionName: 'ProductEventsFunction',
        entry: 'lambda/products/productEventsFunction.js',
        handler: 'handler',
        memorySize: 128,
        timeout: cdk.Duration.seconds(10),
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
        bundling: {
          minify: true,
          sourceMap: false,
        },
        environment: {
          EVENTS_DDB: props.eventsDdb.tableName,
        },
      }
    );
    //so sera permitido escrita nesta funcao
    //props.eventsDdb.grantWriteData(productsEventsHandler);
    // editando as permissoes do IAM na tabela
    const eventsDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [props.eventsDdb.tableArn],
      conditions: {
        ['ForAllValues:StringLike']: {
          'dynamodb:LeadingKeys': ['#product_*'],
        },
      },
    });
    productsEventsHandler.addToRolePolicy(eventsDdbPolicy);

    this.productsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'ProductsFunction',
      {
        functionName: 'ProductsFunction',
        entry: 'lambda/products/productsFunction.js',
        handler: 'handler',
        memorySize: 128,
        timeout: cdk.Duration.seconds(30),
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
        bundling: {
          minify: true,
          sourceMap: false,
        },
        environment: {
          PRODUCTS_DDB: props.productsDdb.tableName,
          //chama a funçao events
          PRODUCT_EVENTS_FUNCTION_NAME: productsEventsHandler.functionName,
        },
      }
    );
    //acoes de leitura e escita no dynamo na tabela referenciada
    props.productsDdb.grantReadWriteData(this.productsHandler);
    //permite que a productsHandler invoque a productsEventsHandler
    productsEventsHandler.grantInvoke(this.productsHandler);
  }
}
