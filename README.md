eth-satochip-keyring
==================

An implementation of MetaMask's [Keyring interface](https://github.com/MetaMask/eth-simple-keyring#the-keyring-class-protocol), that uses a Satochip hardware
wallet for all cryptographic operations.

In most regards, it works in the same way as
[eth-hd-keyring](https://github.com/MetaMask/eth-hd-keyring), but using a Satochip
device. However there are a number of differences:

- Because the keys are stored in the device, operations that rely on the device
  will fail if there is no Satochip device attached, or a different Satochip device
  is attached.
- It does not support the `exportAccount`  methods.

Using
-----

In addition to all the known methods from the [Keyring class protocol](https://github.com/MetaMask/eth-simple-keyring#the-keyring-class-protocol),
there are a few others:


- **isUnlocked** : Returns true if we have the public key in memory, which allows to generate the list of accounts at any time

- **unlock** : Connects to the Satochip device and exports the extended public key, which is later used to read the available ethereum addresses inside the Satochip account.

- **setAccountToUnlock** : the index of the account that you want to unlock in order to use with the signTransaction and signPersonalMessage methods

- **getFirstPage** : returns the first ordered set of accounts from the Satochip account

- **getNextPage** : returns the next ordered set of accounts from the Satochip account based on the current page

- **getPreviousPage** : returns the previous ordered set of accounts from the Satochip account based on the current page

- **forgetDevice** : removes all the device info from memory so the next interaction with the keyring will prompt the user to connect the Satochip device and export the account information

Testing: todo
-------

Attributions
-------
This code was inspired by [eth-ledger-keyring](https://github.com/jamespic/eth-ledger-keyring), [eth-hd-keyring](https://github.com/MetaMask/eth-hd-keyring), [eth-trezor-keyring](https://github.com/MetaMask/eth-trezor-keyring), and [eth-cws-keyring](https://github.com/antoncoding/eth-cws-keyring)
