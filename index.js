const { EventEmitter } = require('events')
const HDKey = require('hdkey')
const ethUtil = require('ethereumjs-util')
const sigUtil = require('eth-sig-util')
const { TransactionFactory } = require('@ethereumjs/tx');
//const EthereumTx = require('ethereumjs-tx')

const type = 'Satochip'
const hdPathString = `m/44'/60'/0'/0`
const pathBase = 'm'
const BRIDGE_URL = 'https://toporin.github.io/Satochip-Connect/v0.5'
//const BRIDGE_URL = 'http://localhost:3000/v0.5'  //satochip-connect test server
const MAX_INDEX = 1000

class SatochipKeyring extends EventEmitter {
  constructor(opts = {}) {
    super()
    console.warn('In eth-satochip-keyring: SatochipKeyring constructor: START')
    this.bridgeUrl = null
    this.type = type
    this.page = 0
    this.perPage = 5
    this.unlockedAccount = 0
    this.hdk = new HDKey()
    this.paths = {}
    this.iframe = null
    this.deserialize(opts)
    this._setupIframe()
    console.warn('In eth-satochip-keyring: SatochipKeyring constructor: END')
  }

  serialize() {
    console.warn('In eth-satochip-keyring: serialize(): START')
    let parentPublicKey= null;
    let parentChainCode= null;
    if (this.isUnlocked()){
        parentPublicKey= this.hdk.publicKey.toString('hex')
        parentChainCode= this.hdk.chainCode.toString('hex')
    }
    return Promise.resolve({
      hdPath: this.hdPath,
      accounts: this.accounts,
      bridgeUrl: this.bridgeUrl,
      parentPublicKey: parentPublicKey,
      parentChainCode: parentChainCode,
      page: this.page
    })
  }

  deserialize(opts = {}) {
    console.warn('In eth-satochip-keyring: deserialize(): START')
    this.hdPath = opts.hdPath || hdPathString
    this.bridgeUrl = opts.bridgeUrl || BRIDGE_URL
    this.accounts = opts.accounts || []
    this.page = opts.page || 0
    if (opts.parentPublicKey) this.hdk.publicKey = Buffer.from(opts.parentPublicKey, 'hex')
    if (opts.parentChainCode) this.hdk.chainCode = Buffer.from(opts.parentChainCode, 'hex')
    console.warn('In eth-satochip-keyring: deserialize(): END')
    return Promise.resolve()
  }

  setAccountToUnlock(index) {
    console.warn('In eth-satochip-keyring: setAccountToUnlock(): START')
    this.unlockedAccount = parseInt(index, 10)
  }

  isUnlocked () {
    console.warn('In eth-satochip-keyring: isUnlocked(): START')
    return Boolean(this.hdk && this.hdk.publicKey)
  }

  unlock() {
    console.warn('In eth-satochip-keyring: unlock(): START')
    console.warn('In eth-satochip-keyring: unlock(): this.isUnlocked(): ', this.isUnlocked())

    if (this.isUnlocked()) return Promise.resolve('already unlocked')

    console.warn('In eth-satochip-keyring: unlock(): RETURN')
    // unlock: get publickey and chainCodes
    return new Promise((resolve, reject) => {
      this._sendMessage(
        {
          action: 'satochip-unlock',
          params: {
            path: this.hdPath
          },
        },
        ({ success, payload }) => {
          if (success) {
            this.hdk.publicKey = Buffer.from(payload.parentPublicKey, 'hex')
            this.hdk.chainCode = Buffer.from(payload.parentChainCode, 'hex')
            //const address = this._addressFromPublicKey(Buffer.from(payload.parentPublicKey, 'hex'))
            //console.warn('In eth-satochip-keyring: unlock(): callback: address: ', address)
            resolve("just unlocked") //resolve(address)
          } else {
            reject(payload.error || 'Unknown error')
          }
        }
      )
    })
  }

  // trezor
  addAccounts (n = 1) {
    return new Promise((resolve, reject) => {
      this.unlock()
        .then(() => {
          const from = this.unlockedAccount
          const to = from + n

          for (let i = from; i < to; i++) {
            const address = this._addressFromIndex(pathBase, i)
            if (!this.accounts.includes(address)) {
              this.accounts.push(address)
            }
            this.page = 0
          }
          resolve(this.accounts)
        })
        .catch((e) => {
          reject(e)
        })
    })
  }

  getFirstPage() {
    console.warn('In eth-satochip-keyring: getFirstPage(): START')
    this.page = 0
    return this.__getPage(1)
  }

  getNextPage() {
    return this.__getPage(1)
  }

  getPreviousPage() {
    return this.__getPage(-1)
  }

  __getPage (increment) {
    this.page += increment

    if (this.page <= 0) {
      this.page = 1
    }

    return new Promise((resolve, reject) => {
      this.unlock()
        .then(() => {

          const from = (this.page - 1) * this.perPage
          const to = from + this.perPage

          const accounts = []

          for (let i = from; i < to; i++) {
            const address = this._addressFromIndex(pathBase, i)
            accounts.push({
              address,
              balance: null,
              index: i,
            })
            this.paths[ethUtil.toChecksumAddress(address)] = i

          }
          resolve(accounts)
        })
        .catch((e) => {
          reject(e)
        })
    })
  }

  getAccounts() {
    console.warn('In eth-satochip-keyring: getAccounts(): START')
    return Promise.resolve(this.accounts.slice())
  }

  removeAccount(address) {
    console.warn('In eth-satochip-keyring: removeAccount(): START')
    if (!this.accounts.map(a => a.toLowerCase()).includes(address.toLowerCase())) {
      throw new Error(`Address ${address} not found in this keyring`)
    }
    this.accounts = this.accounts.filter(a => a.toLowerCase() !== address.toLowerCase())
  }


  signTransaction(address, tx) {
      console.warn('In eth-satochip-keyring: SatochipKeyring signTransaction(): START')
      const path= this._pathFromAddress(address);
      const txData = this._getTxReq(tx, address);
      const chainId = this._getTxChainId(tx, address).toNumber();
      txData.chainId = chainId;
      console.warn('In eth-satochip-keyring: SatochipKeyring signTransaction(): txData=')
      console.warn(txData)

      // for legacy?
      const tx_serialized= tx.serialize().toString('hex') // tx.getMessageToSign(false).toString('hex')
      const tx_hash_true= tx.getMessageToSign(true).toString('hex') // for legacy (backward-compatibility )
      const tx_hash_false= tx.getMessageToSign(true).toString('hex') // for legacy (backward-compatibility )
      console.warn('In eth-satochip-keyring: SatochipKeyring signTransaction(): tx_serialized=')
      console.warn(tx_serialized)
      console.warn('In eth-satochip-keyring: SatochipKeyring signTransaction(): tx_hash_true=')
      console.warn(tx_hash_true)
      console.warn('In eth-satochip-keyring: SatochipKeyring signTransaction(): tx_hash_false=')
      console.warn(tx_hash_false)

      // get signature
      return new Promise((resolve, reject) => {
          this.unlock().then(() => {
              console.warn('In eth-satochip-keyring: SatochipKeyring signTransaction(): after unlock()')

              this._sendMessage(
                  {
                    action: 'satochip-sign-transaction',
                    params: {
                        path,
                        tx: txData,
                        tx_info: {tx_serialized, tx_hash_true, tx_hash_false, chainId, address}, // legacy dataHex
                    },
                  },
                  ({ success, payload }) => {
                    if (success) {
                        console.warn('In eth-satochip-keyring: SatochipKeyring signTransaction(): SUCCES')
                        console.warn('In eth-satochip-keyring: SatochipKeyring signTransaction(): PAYLOAD=')
                        console.warn(payload)

                        // Pack the signature into the return object
                        const txToReturn = tx.toJSON();
                        txToReturn.type = tx._type || null;
                        // EIP155 legacy TransactionUnsigned
                        let v;
                        if (txToReturn.type === 0 ||  txToReturn.type === null) {
                            v= payload.v + 2*chainId + 35;
                        } else {
                            v= payload.v
                        }
                        txToReturn.s= Buffer.from(payload.s, 'hex')
                        txToReturn.r= Buffer.from(payload.r, 'hex')
                        txToReturn.v = v
                        console.warn('In eth-satochip-keyring: SatochipKeyring signTransaction(): txToReturn=')
                        console.warn(txToReturn)
                        const txSigned= TransactionFactory.fromTxData(txToReturn, {
                            common: tx.common, freeze: Object.isFrozen(tx)
                        })
                        console.warn('In eth-satochip-keyring: SatochipKeyring signTransaction(): txSigned=')
                        console.warn(txSigned)
                        const valid = txSigned.verifySignature()
                        if (valid) {
                            console.warn('In eth-satochip-keyring: SatochipKeyring signTransaction(): SIGNATURE VALID!')
                            resolve(txSigned)
                        } else {
                            console.warn('In eth-satochip-keyring: SatochipKeyring signTransaction(): ERROR:')
                            console.warn('Satochip: The transaction signature is not valid')
                            reject(new Error('Satochip: The transaction signature is not valid'))
                        }
                    } else {
                        console.warn('In eth-satochip-keyring: SatochipKeyring signTransaction(): ERROR:')
                        console.warn(payload.error || new Error('Satochip: Unknown error while signing transaction'))
                        reject(payload.error || new Error('Satochip: Unknown error while signing transaction'))
                    }

                }) // end _sendMessage()
            })
            .catch(reject)
        })
  } // end signTransaction()

  _getTxChainId(tx) {
      console.warn('In eth-satochip-keyring: SatochipKeyring _getTxChainId(): START')
      if (tx && tx.common && typeof tx.common.chainIdBN === 'function') {
        return tx.common.chainIdBN();
      } else if (tx && tx.chainId) {
        return new BN(tx.chainId);
      }
      return new BN(1);
  }

  // The request data is built by this helper.
  _getTxReq (tx, address) {
    console.warn('In eth-satochip-keyring: SatochipKeyring _getTxReq(): START')
    let txData;
    try {
      txData = {
        from: address,
        nonce: `0x${tx.nonce.toString('hex')}` || 0,
        gasLimit: `0x${tx.gasLimit.toString('hex')}`,
        to: !!tx.to ? tx.to.toString('hex') : null, // null for contract deployments
        value: `0x${tx.value.toString('hex')}`,
        data: `0x${tx.data.toString('hex')}`,
        //data: tx.data.length === 0 ? null : `0x${tx.data.toString('hex')}`,
      }
      switch (tx._type) {
        case 2: // eip1559
          if ((tx.maxPriorityFeePerGas === null || tx.maxFeePerGas === null) ||
            (tx.maxPriorityFeePerGas === undefined || tx.maxFeePerGas === undefined))
            throw new Error('`maxPriorityFeePerGas` and `maxFeePerGas` must be included for EIP1559 transactions.');
          txData.maxPriorityFeePerGas = `0x${tx.maxPriorityFeePerGas.toString('hex')}`;
          txData.maxFeePerGas = `0x${tx.maxFeePerGas.toString('hex')}`;
          txData.accessList = tx.accessList || [];
          txData.type = 2;
          break;
        case 1: // eip2930
          txData.accessList = tx.accessList || [];
          txData.gasPrice = `0x${tx.gasPrice.toString('hex')}`;
          txData.type = 1;
          break;
        default: // legacy
          txData.gasPrice = `0x${tx.gasPrice.toString('hex')}`;
          txData.type = null;
          break;
      }
    } catch (err) {
      throw new Error(`Failed to build transaction.`)
    }
    console.warn('In eth-satochip-keyring: SatochipKeyring _getTxReq(): txData=')
    console.warn(txData)
    return txData;
  }

  signMessage(withAccount, data) {
    console.warn('In eth-satochip-keyring: signMessage: START')
    return this.signPersonalMessage(withAccount, data)
  }

  // The message will be prefixed on the wallet side
  signPersonalMessage(withAccount, message) {
    console.warn('In eth-satochip-keyring: signPersonalMessage: START')
    console.warn('In eth-satochip-keyring: signPersonalMessage: withAccount: ', withAccount)
    console.warn('In eth-satochip-keyring: signPersonalMessage: message: ', message)
    return new Promise((resolve, reject) => {
      this.unlock().then(() => {
        const path= this._pathFromAddress(withAccount)
        console.warn('In eth-satochip-keyring: signPersonalMessage: path: ', path)
        const hash= this._hashPersonalMessage(message)
        console.warn('In eth-satochip-keyring: signPersonalMessage: hash: ', hash)
        this._sendMessage(
          {
            action: 'satochip-sign-personal-message',
            params: {
              path,
              message,
              hash
            },
          },
          ({ success, payload }) => {
            if (success) {
              console.warn('In eth-satochip-keyring: signPersonalMessage: success: ', success)
              console.warn('In eth-satochip-keyring: signPersonalMessage: payload: ', payload)
              resolve(payload)
            } else {
              console.warn('In eth-satochip-keyring: signPersonalMessage: ERROR: ', payload.error) //TODO
              reject(new Error(payload.error || 'Satochip: Uknown error while signing message'))
            }
          }
        )
      }).catch(error => reject(error))
    })
  }

  _hashPersonalMessage (message) {
    // message is a hex-string prefixed with 0x
    console.warn('In eth-satochip-keyring: _hashPersonalMessage: START')
    const message_buffer = ethUtil.toBuffer(message);
    const hash_buffer = ethUtil.hashPersonalMessage(message_buffer);
    const hash_hex= hash_buffer.toString('hex');
    console.warn('In eth-satochip-keyring: _hashPersonalMessage: hash_hex: ', hash_hex)
    return hash_hex
  }

  signTypedData(withAccount, typedData, options = {}) {
      console.warn('In eth-satochip-keyring: SatochipKeyring signTypedData(): START')
      console.warn('In eth-satochip-keyring: SatochipKeyring signTypedData(): typedData=')
      console.warn(typedData)
      console.warn('In eth-satochip-keyring: SatochipKeyring signTypedData(): options=')
      console.warn(options)
      const isV4 = options.version === 'V4'
      const isV3 = options.version === 'V3'
      if (!isV4 && !isV3) {
        throw new Error('Satochip: Only version 3 & 4 of typed data signing is supported')
      }
      const {
            domain,
            types,
            primaryType,
            message,
      } = sigUtil.TypedDataUtils.sanitizeData(typedData)
      console.warn('In eth-satochip-keyring: SatochipKeyring signTypedData(): domain=')
      console.warn(domain)
      console.warn('In eth-satochip-keyring: SatochipKeyring signTypedData(): types=')
      console.warn(types)
      console.warn('In eth-satochip-keyring: SatochipKeyring signTypedData(): primaryType=')
      console.warn(primaryType)
      console.warn('In eth-satochip-keyring: SatochipKeyring signTypedData(): primaryType=')
      console.warn(message)
      const domainSeparatorHex = sigUtil.TypedDataUtils.hashStruct('EIP712Domain', domain, types, isV4).toString('hex')
      const hashStructMessageHex = sigUtil.TypedDataUtils.hashStruct(primaryType, message, types, isV4).toString('hex')
      console.warn('In eth-satochip-keyring: SatochipKeyring signTypedData(): domainSeparatorHex=')
      console.warn(domainSeparatorHex)
      console.warn('In eth-satochip-keyring: SatochipKeyring signTypedData(): hashStructMessageHex=')
      console.warn(hashStructMessageHex)
      return new Promise((resolve, reject) => {
        this.unlock().then(() => {
          //const addrIndex = this._indexFromAddress(withAccount)
          const path= this._pathFromAddress(withAccount)
          //const publicKey = this._publicKeyFromIndex(addrIndex).toString('hex')
          this._sendMessage(
            {
              action: 'satochip-sign-typed-data',
              params: {
                path,
                address: withAccount,
                typedData,
                domainSeparatorHex,
                hashStructMessageHex
              },
            },
            ({ success, payload }) => {
              if (success) {
                console.warn('In eth-satochip-keyring: SatochipKeyring signTypedData(): PAYLOAD=')
                console.warn(payload)
                resolve(payload)
                // let v= payload.sig.substr(130,2);
                // if (v==='1b'){
                //     v= "00"
                // } else {
                //     v= "01"
                // }
                // const signature= payload.sig.substr(0,130) + v
                // resolve(signature)
              } else {
                reject(new Error(payload.error || 'Satochip: unknown error while signing typed data'))
              }
            }
          )
        }).catch(error => reject(error))
      })
    }

  exportAccount() {
    console.warn('In eth-satochip-keyring: exportAccount(): START')
    throw new Error('Not supported on this device')
  }

  forgetDevice() {
    console.warn('In eth-satochip-keyring: forgetDevice(): START')
    this.accounts = []
    this.page = 0
    this.unlockedAccount = 0
    this.paths = {}
    this.hdk = new HDKey()
  }

  /* PRIVATE METHODS */

  _setupIframe() {
    console.warn('In eth-satochip-keyring: _setupIframe: START')
    this.iframe = document.createElement('iframe')
    this.iframe.src = this.bridgeUrl
    document.head.appendChild(this.iframe)
    console.warn('In eth-satochip-keyring: _setupIframe: END')
  }

  _sendMessage(msg, cb) {
    console.warn('In eth-satochip-keyring: _sendMessage: START')
    msg.target = 'SATOCHIP-IFRAME'
    console.warn('In eth-satochip-keyring: _sendMessage: MSG:', msg)

    this.iframe.contentWindow.postMessage(msg, '*')

    window.addEventListener('message', ({ data }) => {
      console.warn('In eth-satochip-keyring: _sendMessage: CALLBACK data:', data)
      if (data && data.action && data.action === `${msg.action}-reply`) {
        cb(data)
      }
    })

    console.warn('In eth-satochip-keyring: _sendMessage: END')
  }

   _normalize (buf) {
    return ethUtil.bufferToHex(buf).toString()
  }

/*   // cws only
  // TODO: remove
  _addressFromPublicKey(publicKey) {
    console.warn('In eth-satochip-keyring: _addressFromPublicKey: START')
    const address = ethUtil.pubToAddress(publicKey, true).toString('hex')
    return ethUtil.toChecksumAddress(address)
  } */

  // trezor version
  // eslint-disable-next-line no-shadow
  _addressFromIndex (pathBase, i) {
    const dkey = this.hdk.derive(`${pathBase}/${i}`)
    const address = ethUtil
      .publicToAddress(dkey.publicKey, true)
      .toString('hex')
    return ethUtil.toChecksumAddress(`0x${address}`)
  }

  // trezor only
  _pathFromAddress (address) {
    const checksummedAddress = ethUtil.toChecksumAddress(address)
    let index = this.paths[checksummedAddress]
    if (typeof index === 'undefined') {
      for (let i = 0; i < MAX_INDEX; i++) {
        if (checksummedAddress === this._addressFromIndex(pathBase, i)) {
          index = i
          break
        }
      }
    }

    if (typeof index === 'undefined') {
      throw new Error('Unknown address')
    }
    return `${this.hdPath}/${index}`
  }

}

SatochipKeyring.type = type
module.exports = SatochipKeyring
console.warn('In eth-satochip-keyring: END')
