import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apigatewayv2_integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambdaEventsSourcce from 'aws-cdk-lib/aws-lambda-event-sources';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources';
interface InvoiceWSApiStackProps extends cdk.StackProps {
  eventsDdb: dynamodb.Table;
}
export class InvoiceWSApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InvoiceWSApiStackProps) {
    super(scope, id, props);

    //invoice and invoice transactions DDB
    const invoicesDdb = new dynamodb.Table(this, 'InvoicesDdb', {
      tableName: 'invoices',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: 'ttl',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });

    //invoice bucket
    const bucket = new s3.Bucket(this, 'InvoiceBucket', {
      bucketName: 'gagps-invoices',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    //webSocket connection handler
    const connectionHandler = new lambdaNodeJS.NodejsFunction(this, 'InvoiceConnectionFunction', {
      functionName: 'InvoiceConnectionFunction',
      entry: 'lambda/invoices/invoiceConnectionFunction.js',
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
      bundling: {
        minify: false,
        sourceMap: false,
      },
    });

    //webSocket disconnection handler
    const disconnectionHandler = new lambdaNodeJS.NodejsFunction(this, 'InvoiceDisconnectionFunction', {
      functionName: 'InvoiceDisconnectionFunction',
      entry: 'lambda/invoices/invoiceDisconnectionFunction.js',
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
      bundling: {
        minify: false,
        sourceMap: false,
      },
    });

    //webSocket API
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'InvoiceWSApi', {
      apiName: 'InvoiceWSApi',
      connectRouteOptions: {
        integration: new apigatewayv2_integrations.WebSocketLambdaIntegration('LambdaIntegrationConnection', connectionHandler),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2_integrations.WebSocketLambdaIntegration('LambdaIntegrationDesconnection', disconnectionHandler),
      },
    });
    const stage = 'prod';
    const wsApiEndpoint = `${webSocketApi.apiEndpoint}/${stage}`;

    new apigatewayv2.WebSocketStage(this, 'InvoiceWSApiStage', {
      webSocketApi,
      stageName: stage,
      autoDeploy: true,
    });

    //arn - amazon resource name
    const resourcePost = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${stage}/POST/@connections/*`;
    const resourceGet = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${stage}/GET/@connections/*`;
    const resourceDelete = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${stage}/DELETE/@connections/*`;

    const wsApiPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:ManageConnections'],
      resources: [resourcePost, resourceGet, resourceDelete],
    });

    //invoice URL handler
    const getUrlHandler = new lambdaNodeJS.NodejsFunction(this, 'InvoiceGetUrlFunction', {
      functionName: 'InvoiceGetUrlFunction',
      entry: 'lambda/invoices/invoiceGetUrlFunction.js',
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
      bundling: {
        minify: false,
        sourceMap: false,
      },
      environment: {
        INVOICES_DDB: invoicesDdb.tableName,
        BUCKET_NAME: bucket.bucketName,
        INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
      },
    });

    const invoicesDdbWriteTransationPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [invoicesDdb.tableArn],
      conditions: {
        ['ForAllValues:StringLike']: {
          'dynamodb:LeadingKeys': ['#transaction'],
        },
      },
    });

    const invoicesBucketPutObjectPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['S3:PutObject'],
      resources: [`${bucket.bucketArn}/*`],
    });

    getUrlHandler.addToRolePolicy(invoicesBucketPutObjectPolicy);
    getUrlHandler.addToRolePolicy(wsApiPolicy);
    getUrlHandler.addToRolePolicy(invoicesDdbWriteTransationPolicy);

    //invoice import handler
    const invoiceImportHandler = new lambdaNodeJS.NodejsFunction(this, 'InvoiceImportFunction', {
      functionName: 'InvoiceImportFunction',
      entry: 'lambda/invoices/invoiceImportFunction.js',
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
      bundling: {
        minify: false,
        sourceMap: false,
      },
      environment: {
        INVOICES_DDB: invoicesDdb.tableName,
        INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
      },
    });
    const invoicesBucketGetDeleteObjectPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:DeleteObject', 's3:GetObject'],
      resources: [`${bucket.bucketArn}/*`],
    });
    invoiceImportHandler.addToRolePolicy(invoicesBucketGetDeleteObjectPolicy);
    invoicesDdb.grantReadWriteData(invoiceImportHandler);
    invoiceImportHandler.addToRolePolicy(wsApiPolicy);

    bucket.addEventNotification(s3.EventType.OBJECT_CREATED_PUT, new s3n.LambdaDestination(invoiceImportHandler));

    //cancel import handler

    //webSocket API routes
    webSocketApi.addRoute('getImportUrl', {
      integration: new apigatewayv2_integrations.WebSocketLambdaIntegration('integrationApiRoutesGet', getUrlHandler),
    });

    /* webSocketApi.addRoute('cancelImport', {
      integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
        'integrationApiRoutesCancel',
        getUrlHandler
      ),
    }); */

    const invoiceEventsHandler = new lambdaNodeJS.NodejsFunction(this, 'InvoiceEventsFunction', {
      functionName: 'InvoiceEventsFunction',
      entry: 'lambda/invoices/invoiceEventsFunction.js',
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
      bundling: {
        minify: false,
        sourceMap: false,
      },
      environment: {
        EVENTS_DDB: props.eventsDdb.tableName,
        INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
      },
    });
    //edita o acesso do IAM autorizando ou negando o que se pode executar
    const eventsDdbPolicy = new iam.PolicyStatement({
      //permite
      effect: iam.Effect.ALLOW,
      //permite alterar apenas
      actions: ['dynamodb:PutItem'],
      //acessa apenas esse recurso, com a ação acima
      resources: [props.eventsDdb.tableArn],
      //condicoes que a acao pode realizar
      conditions: {
        ['ForAllValues:StringLike']: {
          // faz se todos os valores forem iguais a variaveis abaixo
          'dynamodb:LeadingKeys': ['#invoice_*'], // se a chave primaria tiver este formato começando com esse valor entre []
        },
      },
    });
    invoiceEventsHandler.addToRolePolicy(eventsDdbPolicy);
    invoiceEventsHandler.addToRolePolicy(wsApiPolicy);

    const invoiceEventsDlq = new sqs.Queue(this, 'InvoiceEventsDlq', {
      queueName: 'invoice-events-dlq',
      retentionPeriod: cdk.Duration.days(10),
    });
    invoiceEventsHandler.addEventSource(
      new lambdaEventsSourcce.DynamoEventSource(invoicesDdb, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 5,
        bisectBatchOnError: true,
        onFailure: new SqsDlq(invoiceEventsDlq),
        retryAttempts: 3,
      })
    );
  }
}
