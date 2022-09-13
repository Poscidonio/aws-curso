#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import 'source-map-support/register';
import { ECommerceApiStack } from '../lib/ecommerceApi-stack';
import { EventsDdbStack } from '../lib/eventsDdb-stack';
import { ProductsDdbStack } from '../lib/productsDdb-stack';
import { ProductsFunctionStack } from '../lib/productsFunction-stack';
import { OrdersApplicationStack } from '../lib/ordersApplication-stack';
import { InvoiceWSApiStack } from '../lib/invoicesWSApi-stack';

//a ordem das stacks definem a ordem em que serao executadas e caso execute apenas uma stack sempre colocar o -e
//pois mesmo executando
//define como uma unica instancia raiz da arvore que sera referenciada nas demais instancias
const app = new cdk.App();
const env = {
  region: 'us-east-1',
};
//criado para ver em qual ambiente esta sendo executado e gerenciamento de custos
const tags = {
  cost: 'ECommerceX',
  team: 'SiecolaCodeCX',
};
const eventsDdbStack = new EventsDdbStack(app, 'EventsDdb', {
  env: env,
  tags: tags,
});
//instancias criada para apontar para as stacks
const productsDdbStack = new ProductsDdbStack(app, 'ProductsDdb', {
  env: env,
  tags: tags,
});
const productsFunctionStack = new ProductsFunctionStack(app, 'ProductsFunction', {
  productsDdb: productsDdbStack.table,
  eventsDdb: eventsDdbStack.table,
  env: env,
  tags: tags,
});
productsFunctionStack.addDependency(productsDdbStack);
productsFunctionStack.addDependency(eventsDdbStack);

const ordersApplicationStack = new OrdersApplicationStack(app, 'OrdersApplication', {
  productsDdb: productsDdbStack.table,
  eventsDdb: eventsDdbStack.table,
  env: env,
  tags: tags,
});

ordersApplicationStack.addDependency(productsDdbStack);
ordersApplicationStack.addDependency(eventsDdbStack);

const eCommerceApiStack = new ECommerceApiStack(app, 'ECommerceApi', {
  productsHandler: productsFunctionStack.productsHandler,
  ordersHandler: ordersApplicationStack.ordersHandler,
  orderEventsFetchHandler: ordersApplicationStack.orderEventsFetchHandler,
  env: env,
  tags: tags,
});
eCommerceApiStack.addDependency(productsFunctionStack);
eCommerceApiStack.addDependency(ordersApplicationStack);

const invoiceWSApiStack = new InvoiceWSApiStack(app, 'InvoiceApi', {
  tags: {
    cost: 'InvoiceApp',
    team: 'SiecolaCode',
  },
  //no curso ele ensina em outra regiao entao deve ser colocado toda vez o env na invocacao da Stack
  env: env,
  eventsDdb: eventsDdbStack.table,
});
invoiceWSApiStack.addDependency(eventsDdbStack);
