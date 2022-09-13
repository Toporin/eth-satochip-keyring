# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1]

Compatible with Metamask-Extension v10.14.7
Compatible with Satochip-Connect v0.5.x

### Bug fix

Null exception in serialize(): this.hdk.publicKey.toString('hex') when hdk or hdk.publicKey is null.

## [0.3.0]

Compatible with Metamask-Extension v10.14.7
Compatible with Satochip-Connect v0.5.x

### Added
Added support for EIP712 (signTypedData) and EIP1559.

### Updated
Updated ethereumjs-util to ^7.0.10 (support EIP1559)
Updated @ethereumjs/tx" to ^3.2.1
Updated metamask/eth-sig-util to 4.0.1

## [0.2.0]
### Added
Added support for Satochip-2FA by providing chainId and address data to the Satochip-Bridge


### Removed
rlp library was removed as it was not used actually

## [0.1.0]
### Added
Initial commit
