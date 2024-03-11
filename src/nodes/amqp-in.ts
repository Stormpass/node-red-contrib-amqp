import { NodeRedApp, EditorNodeProperties } from 'node-red'
import { NODE_STATUS } from '../constants'
import { AmqpInNodeDefaults, AmqpOutNodeDefaults, ErrorType, NodeType } from '../types'
import Amqp from '../Amqp'

module.exports = function (RED: NodeRedApp): void {
  function AmqpIn(config: EditorNodeProperties): void {
    let reconnectTimeout: NodeJS.Timeout
    RED.events.once('flows:stopped', () => {
      clearTimeout(reconnectTimeout)
    })

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    RED.nodes.createNode(this, config)
    this.status(NODE_STATUS.Disconnected)

    const confgiAmqp: AmqpInNodeDefaults & AmqpOutNodeDefaults = config;

    const amqp = new Amqp(RED, this, confgiAmqp)

    const maxAttempts = confgiAmqp.maxAttempts;
    let totalAttempts = 0;

    let reconnect;

    const inputListener = async (msg, _, done) => {
      if (msg.payload && msg.payload.reconnectCall && typeof reconnect === 'function') {
        await reconnect()
        done && done()
      } else {
        done && done()
      }
    }

    // receive input reconnectCall
    this.on('input', inputListener)

    ;(async function initializeNode(self): Promise<void> {
      reconnect = () =>
        new Promise<void>(resolve => {
          if(maxAttempts === 0 || totalAttempts < maxAttempts) {
            reconnectTimeout = setTimeout(async () => {
              try {
                await initializeNode(self)
                resolve()
              } catch (e) {
                await reconnect()
              }
            }, 2000)
          } else {
            self.warn(`Max connection attempts reached (${maxAttempts}). No more connection will be tried.`)
          }
        })

      try {
        totalAttempts++;
        if(maxAttempts === 0) {
          self.log(`AMQP Connection attempt ${totalAttempts}`);
        } else {
          self.log(`AMQP Connection attempt ${totalAttempts} on ${maxAttempts}`);
        }
        const connection = await amqp.connect()

        // istanbul ignore else
        if (connection) {
          await amqp.initialize()
          await amqp.consume()

          // When the node is re-deployed
          self.once('close', async (done: () => void): Promise<void> => {
            await amqp.close()
            done && done()
          })

          // When the server goes down
          connection.once('close', async e => {
            e && (await reconnect())
          })

          self.status(NODE_STATUS.Connected)
        }
      } catch (e) {
        if (e.code === ErrorType.ConnectionRefused || e.isOperational) {
          await reconnect()
        } else if (e.code === ErrorType.InvalidLogin) {
          self.status(NODE_STATUS.Invalid)
          self.error(`AmqpIn() Could not connect to broker ${e}`, { payload: { error: e, source: 'AmqpIn' } })
        } else {
          self.status(NODE_STATUS.Error)
          self.error(`AmqpIn() ${e}`, { payload: { error: e, source: 'AmqpIn' } })
        }
      }
    })(this)
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  RED.nodes.registerType(NodeType.AmqpIn, AmqpIn)
}
