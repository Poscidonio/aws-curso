import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventsSourcce from 'aws-cdk-lib/aws-lambda-event-sources';

interface OrdersApplicationStackProps extends cdk.StackProps {
  productsDdb: dynamodb.Table;
  eventsDdb: dynamodb.Table;
}

export class OrdersApplicationStack extends cdk.Stack {
  readonly ordersHandler: lambdaNodeJS.NodejsFunction;
  readonly orderEventsFetchHandler: lambdaNodeJS.NodejsFunction;
  constructor(
    scope: Construct,
    id: string,
    props: OrdersApplicationStackProps
  ) {
    super(scope, id, props);

    const ordersDdb = new dynamodb.Table(this, 'OrdersDdb', {
      tableName: 'orders',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });
    //definindo as unidades de leitura
    const readScale = ordersDdb.autoScaleReadCapacity({
      maxCapacity: 2,
      minCapacity: 1,
    });
    //defini uma porcentagem para acrescentar unidades de leitura de acordo com a utilizaçao
    //ou seja ira acrescentar um a cada 80 %
    readScale.scaleOnUtilization({
      targetUtilizationPercent: 80,
      //espera 60 segndos para subir ou descer a unidade de leitura
      scaleInCooldown: cdk.Duration.seconds(120),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    //definindo as unidades de escrita
    const writeScale = ordersDdb.autoScaleWriteCapacity({
      maxCapacity: 4,
      minCapacity: 1,
    });
    //defini uma porcentagem para acrescentar unidades de escrita de acordo com a utilizaçao
    //ou seja ira acrescentar um a cada 20 %
    writeScale.scaleOnUtilization({
      targetUtilizationPercent: 20,
      //espera 60 segndos para subir ou descer a unidade de escrita
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });
    const ordersTopic = new sns.Topic(this, 'OrderEventsTopic', {
      displayName: 'Orders events topic',
      topicName: 'order-events',
    });

    this.ordersHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'OrdersFunction',
      {
        functionName: 'OrdersFunction',
        entry: 'lambda/orders/ordersFunction.js',
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
          PRODUCTS_DDB: props.productsDdb.tableName,
          ORDERS_DDB: ordersDdb.tableName,
          ORDERS_EVENTS_TOPIC_ARN: ordersTopic.topicArn,
        },
      }
    );
    props.productsDdb.grantReadData(this.ordersHandler);
    ordersDdb.grantReadWriteData(this.ordersHandler);
    ordersTopic.grantPublish(this.ordersHandler);

    const orderEmailsDlq = new sqs.Queue(this, 'OrderEmailsDlq', {
      queueName: 'order-emails-dlq',
    });
    const orderEventsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'OrdersEventsFunction',
      {
        functionName: 'OrdersEventsFunction',
        entry: 'lambda/orders/ordersEventsFunction.js',
        handler: 'handler',
        memorySize: 128,
        timeout: cdk.Duration.seconds(10),
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
        deadLetterQueueEnabled: true,
        deadLetterQueue: orderEmailsDlq,
        retryAttempts: 2,
        bundling: {
          minify: false,
          sourceMap: false,
        },
        environment: {
          EVENTS_DDB: props.eventsDdb.tableName,
        },
      }
    );
    ordersTopic.addSubscription(
      new subs.LambdaSubscription(orderEventsHandler)
    );
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
          'dynamodb:LeadingKeys': ['#order_*'], // se a chave primaria tiver este formato começando com esse valor entre []
        },
      },
    });
    orderEventsHandler.addToRolePolicy(eventsDdbPolicy);

    const paymentsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'PaymentsFunction',
      {
        functionName: 'PaymentsFunction',
        entry: 'lambda/orders/paymentsFunction.js',
        handler: 'handler',
        memorySize: 128,
        timeout: cdk.Duration.seconds(10),
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
        deadLetterQueueEnabled: true,
        bundling: {
          minify: false,
          sourceMap: false,
        },
      }
    );
    ordersTopic.addSubscription(
      new subs.LambdaSubscription(paymentsHandler, {
        filterPolicy: {
          //filtra as mensagens que serao exibidas
          eventType: sns.SubscriptionFilter.stringFilter({
            //permitido
            allowlist: ['ORDER_CREATED'],
            //negado
            denylist: ['OREDR_DELETED', 'ORDER_UPDATED'],
          }),
        },
      })
    );
    //dlq fila para mensagens que nao foram executadas apos 3 tentativas
    const orderEventsDlq = new sqs.Queue(this, 'OrderEventsDlq', {
      queueName: 'order-events-dlq',
      retentionPeriod: cdk.Duration.days(10),
    });
    //criando a fila
    const orderEventsQueue = new sqs.Queue(this, 'OrderEventsQueue', {
      queueName: 'order-events',
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: orderEventsDlq,
      },
    });
    //escrevendo a fila no topico
    ordersTopic.addSubscription(new subs.SqsSubscription(orderEventsQueue));

    const orderEmailHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'OrderEmailsFunction',
      {
        functionName: 'OrderEmailsFunction',
        entry: 'lambda/orders/orderEmailsFunction.js',
        handler: 'handler',
        memorySize: 128,
        timeout: cdk.Duration.seconds(10),
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
        bundling: {
          minify: false,
          sourceMap: false,
        },
      }
    );
    //configuracao da fone de eventos lambda
    orderEmailHandler.addEventSource(
      new lambdaEventsSourcce.SqsEventSource(orderEventsQueue, {
        //numero maximo de mensagens paa chamar a funcao
        batchSize: 5,
        enabled: true,
        //espea por um minuto antes da execucao
        maxBatchingWindow: cdk.Duration.seconds(10),
      })
    );
    orderEventsQueue.grantConsumeMessages(orderEmailHandler);

    const orderEmailSesPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    });
    orderEmailHandler.addToRolePolicy(orderEmailSesPolicy);

    this.orderEventsFetchHandler = new lambdaNodeJS.NodejsFunction(
      this,
      'OrderEventsFetchFunction',
      {
        functionName: 'OrderEventsFetchFunction',
        entry: 'lambda/orders/orderEventsFetchFunction.js',
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
        },
      }
    );
    const eventsFetchDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:Query'],
      resources: [`${props.eventsDdb.tableArn}/index/emailIdx`],
      /* conditions: {
        ['ForAllValues:StringLike']: {
          'dynamodb:LeadingKeys': ['#order_*'],
        },
      }, */
    });
    this.orderEventsFetchHandler.addToRolePolicy(eventsFetchDdbPolicy);
  }
}
