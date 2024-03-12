import { NodeRedApp, EditorNodeProperties } from 'node-red'
import { NODE_STATUS } from '../constants'
import { ErrorType, NodeType, ManualAckType, AmqpOutNodeDefaults, AmqpInNodeDefaults, ErrorLocationEnum } from '../types'
import Amqp from '../Amqp'

module.exports = function (RED: NodeRedApp): void {
  function AmqpInManualAck(config: EditorNodeProperties): void {
    let reconnectTimeout: NodeJS.Timeout
    let reconnect = null;
    let connection = null;
    let channel = null;

    RED.events.once('flows:stopped', () => {
      clearTimeout(reconnectTimeout)
    })

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    RED.nodes.createNode(this, config)
    this.status(NODE_STATUS.Disconnected)

    const configAmqp: AmqpInNodeDefaults & AmqpOutNodeDefaults = config;

    const amqp = new Amqp(RED, this, configAmqp)

    const reconnectOnError = configAmqp.reconnectOnError;

    const inputListener = async (msg, _, done) => {
      // handle manualAck
      if (msg.manualAck) {
        const ackMode = msg.manualAck.ackMode

        switch (ackMode) {
          case ManualAckType.AckAll:
            amqp.ackAll()
            break
          case ManualAckType.Nack:
            amqp.nack(msg)
            break
          case ManualAckType.NackAll:
            amqp.nackAll(msg)
            break
          case ManualAckType.Reject:
            amqp.reject(msg)
            break
          case ManualAckType.Ack:
          default:
            amqp.ack(msg)
            break
        }
      } else {
        amqp.ack(msg)
      }
      // handle manual reconnect
      if (msg.payload && msg.payload.reconnectCall && typeof reconnect === 'function') {
        await reconnect()
        done && done()
      } else {
        done && done()
      }
    }
    // receive input reconnectCall
    this.on('input', inputListener)
    // When the server goes down
    this.on('close', async (done: () => void): Promise<void> => {
      await amqp.close()
      done && done()
    })

    async function initializeNode(nodeIns) {
      reconnect = async () => {
        // check the channel and clear all the event listener
        if (channel && channel.removeAllListeners) {
          channel.removeAllListeners()
          channel.close();
          channel = null;
        }

        // check the connection and clear all the event listener
        if (connection && connection.removeAllListeners) {
          connection.removeAllListeners()
          connection.close();
          connection = null;
        }

        // always clear timer before set it;
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          try {
            initializeNode(nodeIns)
          } catch (e) {
            reconnect()
          }
        }, 2000)
      }


      try {
        const connection = await amqp.connect()

        // istanbul ignore else
        if (connection) {
          const channel = await amqp.initialize()
          await amqp.consume()

          // When the connection goes down
          connection.on('close', async e => {
            e && (await reconnect())
          })

          // When the connection goes down
          connection.on('error', async e => {
            e && reconnectOnError && (await reconnect())
            nodeIns.error(`Connection error ${e}`, { payload: { error: e, location: ErrorLocationEnum.ConnectionErrorEvent } })
          })

          // When the channel goes down
          channel.on('error', async (e) => {
            e && reconnectOnError && (await reconnect())
            nodeIns.error(`Channel error ${e}`, { payload: { error: e, location: ErrorLocationEnum.ChannelErrorEvent } })
          })

          nodeIns.status(NODE_STATUS.Connected)
        }
      } catch (e) {
        if (e.code === ErrorType.ConnectionRefused || e.isOperational) {
          reconnectOnError && (await reconnect())
        } else if (e.code === ErrorType.InvalidLogin) {
          nodeIns.status(NODE_STATUS.Invalid)
          nodeIns.error(`AmqpInManualAck() Could not connect to broker ${e}`, { payload: { error: e, location: ErrorLocationEnum.ConnectError } })
        } else {
          nodeIns.status(NODE_STATUS.Error)
          nodeIns.error(`AmqpInManualAck() ${e}`, { payload: { error: e, location: ErrorLocationEnum.ConnectError } })
        }
      }
    }

    // call
    initializeNode(this);
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  RED.nodes.registerType(NodeType.AmqpInManualAck, AmqpInManualAck)
}
