import { motion } from 'framer-motion';
import { Download, Share, Smartphone, SquarePlus, Check } from 'lucide-react';
import { item } from '../lib/motion';
import { useInstall } from '../lib/pwa';
import { useToast } from './Toast';

export function InstallCard() {
  const { installed, canPrompt, ios, prompt } = useInstall();
  const toast = useToast();

  return (
    <motion.section className="card form-card install" variants={item}>
      <h2 className="form-card__title">
        <Smartphone size={20} /> スマホアプリとして使う
      </h2>
      {installed ? (
        <p className="install__done">
          <Check size={16} /> アプリとして開いています。ホーム画面のアイコンからいつでも起動できます。
        </p>
      ) : (
        <>
          <p className="install__lead">ホーム画面に追加すると、アドレスバーなしの全画面でアプリのように使えます。無料で、ストアからのダウンロードも不要です。</p>
          {canPrompt && (
            <button
              className="btn btn--primary"
              onClick={async () => {
                if (await prompt()) toast('ホーム画面に追加しました', 'success');
              }}
            >
              <Download size={16} /> アプリをインストール
            </button>
          )}
          {!canPrompt && (
            <ol className="install__steps">
              {ios ? (
                <>
                  <li>
                    Safari で開き、下の <Share size={15} /> <b>共有</b> ボタンを押す
                  </li>
                  <li>
                    <SquarePlus size={15} /> <b>ホーム画面に追加</b> を選ぶ
                  </li>
                  <li>
                    右上の <b>追加</b> を押す
                  </li>
                </>
              ) : (
                <>
                  <li>
                    Android の Chrome で開き、右上の <b>︙</b> メニューを押す
                  </li>
                  <li>
                    <b>アプリをインストール</b>（または <b>ホーム画面に追加</b>）を選ぶ
                  </li>
                  <li>
                    確認画面で <b>インストール</b> を押す
                  </li>
                </>
              )}
            </ol>
          )}
        </>
      )}
    </motion.section>
  );
}
