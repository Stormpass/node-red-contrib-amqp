

# source
This repo fork from @meowwolf/node-red-contrib-amqp

and

+ upgrade amqplib so you can use it with node10+
+ fixed direct routing publish issues
+ allow reconnect on error
+ manually control node reconnect
+ fixed multi event listener on connection (cause memory leak)

AMQP nodes for node-red

## Installation

Install via the Palette Manager or from within your node-red directory (typically `~/.node-red`) run:

```
npm i @stormpass/node-red-contrib-amqp
```

## Usage

Provides three standard nodes and an amqp broker config node.  
Please see the `Node Help` section from within node-red for more info

## Development

### Build the project

```
npm run build
```

### Run tests

```
npm test
```

Run coverage:

```
npm run test:cov
```

