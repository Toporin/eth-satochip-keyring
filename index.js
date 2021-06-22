const { EventEmitter } = require('events')
const HDKey = require('hdkey')
const ethUtil = require('ethereumjs-util')
const EthereumTx = require('ethereumjs-tx')
const type = 'Satochip'
const hdPathString = `m/44'/60'/0'/0`
const pathBase = 'm'
const BRIDGE_URL = 'https://toporin.github.io/Satochip-Connect/'
//const BRIDGE_URL = 'http://localhost:3000'  //satochip-connect test server
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
    return Promise.resolve({
      hdPath: this.hdPath,
      accounts: this.accounts,
      bridgeUrl: this.bridgeUrl,
      parentPublicKey: this.hdk.publicKey.toString('hex'),
      parentChainCode: this.hdk.chainCode.toString('hex'),
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
  
/*   // TODO merge with isUnlocked()
  hasAccountKey() {
    console.warn('In eth-satochip-keyring: hasAccountKey(): START')
    const result = !!(this.hdk && this.hdk.publicKey)
    console.warn('In eth-satochip-keyring: hasAccountKey: result:', result)
    console.warn('In eth-satochip-keyring: hasAccountKey(): RETURN')
    return result
  } */

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

  // tx is an instance of the ethereumjs-transaction class.
  signTransaction(address, tx) {
    console.warn('In eth-satochip-keyring: signTransaction: START')
    console.warn('In eth-satochip-keyring: signTransaction: tx: ', tx)
    
    const tx_serialized= tx.serialize().toString('hex')
    const tx_hash_true= tx.hash(true).toString('hex') // legacy
    const tx_hash_false= tx.hash(false).toString('hex') // EIP155
    const chainId= tx._chainId
    
    return new Promise((resolve, reject) => {
      this.unlock().then(() => {
        const path= this._pathFromAddress (address) 
        const transaction = {
          to: this._normalize(tx.to),
          value: this._normalize(tx.value),
          data: this._normalize(tx.data),
          chainId: tx._chainId,
          nonce: this._normalize(tx.nonce),
          gasLimit: this._normalize(tx.gasLimit),
          gasPrice: this._normalize(tx.gasPrice),
        }

        this._sendMessage(
          {
            action: 'satochip-sign-transaction',
            params: {
              tx: transaction,
              tx_info: {tx_serialized, tx_hash_true, tx_hash_false, chainId, address}, // debugsatochip
              path
            },
          },
          ({ success, payload }) => {
            if (success) {
              tx.s= Buffer.from(payload.s, 'hex')
              tx.r= Buffer.from(payload.r, 'hex')
              tx.v = payload.v
              resolve(tx)
            } else {
              reject(new Error(payload.error || 'Satochip: Unknown error while signing transaction'))
            }
          }
        )
      }).catch(error => {
        reject(error)
      })
    })
  }

  signMessage(withAccount, data) {
    console.warn('In eth-satochip-keyring: signMessage: START')
    return this.signPersonalMessage(withAccount, data) // TODO: sign data without hashing?
  }

  // The message will be prefixed in the sdk
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

/*   signTypedData(withAccount, typedData) {
    console.warn('In eth-satochip-keyring: signTypedData(): START')
    return new Promise((resolve, reject) => {
      this.unlock().then(() => {
        const addrIndex = this._indexFromAddress(withAccount)
        const publicKey = this._publicKeyFromIndex(addrIndex).toString('hex')
        this._sendMessage(
          {
            action: 'satochip-sign-typed-data',
            params: {
              addrIndex,
              typedData,
              publicKey
            },
          },
          ({ success, payload }) => {
            if (success) {
              resolve(payload)
            } else {
              reject(new Error(payload.error || 'Satochip: Uknown error while signing typed data'))
            }
          }
        )
      }).catch(error => reject(error))
    })
  } */


  signTypedData () {
    // TODO
    return Promise.reject(new Error('Not supported on this device'))
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