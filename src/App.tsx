import React, { useEffect } from 'react';
import {
  fromUtxo,
  P2PKH,
  PrivateKey,
  PublicKey,
  Script,
  Transaction,
  TransactionOutput,
  UnlockingScript,
  Utils,
} from '@bsv/sdk';
import { SignatureRequest, useYoursWallet } from 'yours-wallet-provider';

import './App.css';

function App() {
  const wallet = useYoursWallet();

  useEffect(() => {
    if (!wallet?.on) return;
    wallet.on('switchAccount', () => {
      console.log('switchAccount');
      // handle switching or creating a new account for the user within your app
    });

    wallet.on('signedOut', () => {
      console.log('signedOut');
      wallet.disconnect();
    });
  }, [wallet]);

  const test = async () => {
    if (!wallet?.isReady) {
      throw new Error('Wallet is not ready');
    }

    await wallet.connect();

    const utxoList = await wallet.getPaymentUtxos();
    const pubKeys = await wallet.getPubKeys();
    const network = await wallet.getNetwork();
    const addressList = await wallet.getAddresses();

    if (!pubKeys?.identityPubKey || !utxoList?.length || !addressList?.identityAddress) {
      console.error({ pubKeys, utxoList, addressList });
      throw new Error('Something went wrong');
    }

    const addressToUseInSignatureRequest = Utils.toBase58Check(
      Script.fromHex(utxoList[0].script).chunks[2].data as number[]
    );

    const pubKey = PublicKey.fromString(pubKeys.identityPubKey);
    const { identityAddress: addr, bsvAddress: bsvAddr } = addressList!;

    console.log({
      network,
      pAddr: pubKey.toAddress(),
      bsvAddr,
      addressList,
      utxoList,
      pubKeys,
      pubKey: pubKey.toString(),
    });

    const input = fromUtxo(
      {
        txid: utxoList[0].txid,
        vout: utxoList[0].vout,
        satoshis: utxoList[0].satoshis,
        script: utxoList[0].script,
      },
      new P2PKH().unlock(PrivateKey.fromRandom())
    );

    const output0: TransactionOutput = {
      lockingScript: new P2PKH().lock(bsvAddr),
      satoshis: 50,
    };
    const output1: TransactionOutput = {
      lockingScript: new P2PKH().lock(bsvAddr),
      change: true,
    };

    input.unlockingScript = new UnlockingScript();

    const tx = new Transaction(1, [input], [output0, output1]);
    await tx.fee();
    const unsignedTx = tx.toHexEF();

    const t2 = Transaction.fromHexEF(unsignedTx);

    const sigRequests: SignatureRequest[] = [
      {
        prevTxid: t2.inputs[0].sourceTXID!,
        outputIndex: t2.inputs[0].sourceOutputIndex,
        inputIndex: 0,
        satoshis: t2.inputs[0].sourceTransaction!.outputs[t2.inputs[0].sourceOutputIndex].satoshis!,
        address: addressToUseInSignatureRequest,
      },
    ];

    console.log({ sigRequests });

    const sigResponses = await wallet.getSignatures({
      rawtx: t2.toHex(),
      format: 'tx', // tx, beef, ef
      sigRequests,
    });

    console.log({ sigResponses });

    const u = new UnlockingScript();
    u.writeBin(Utils.toArray(sigResponses?.[0]?.sig, 'hex'));
    u.writeBin(Utils.toArray(sigResponses?.[0]?.pubKey, 'hex'));

    t2.inputs[0].unlockingScript = u;

    console.log('t2', t2.toHex());
  };

  return <button onClick={test}>Test</button>;
}

export default App;
