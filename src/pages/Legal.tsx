import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { LogoMark } from '../components/Logo';

type Kind = 'privacy' | 'terms';

const UPDATED = '2026年11月18日';

const CONTENT: Record<Kind, { title: string; sections: { h: string; p: string[] }[] }> = {
  privacy: {
    title: 'プライバシーポリシー',
    sections: [
      {
        h: '1. 本サービスについて',
        p: ['MeetFlow（以下「本サービス」）は、運営者個人が自身のミーティング日程調整のために運営する予約ページです。'],
      },
      {
        h: '2. 取得する情報',
        p: [
          '予約されるお客様から、お名前、メールアドレス、会社名、備考、予約ページの質問への回答、予約日時を取得します。',
          '不正利用の防止のため、アクセス元のIPアドレスを一時的に記録します。',
        ],
      },
      {
        h: '3. 利用目的',
        p: ['取得した情報は、予約の受付・確認・変更・キャンセル、ミーティングの実施とご連絡、不正利用の防止のためにのみ利用します。広告や第三者への販売には利用しません。'],
      },
      {
        h: '4. Googleユーザーデータの取り扱い',
        p: [
          '本サービスは、運営者本人のGoogleアカウントに限り、Googleカレンダーへのアクセスを許可されています。取得する範囲は、空き時間を判定するための予定の日時と件名、および予約確定時の予定の作成・削除（Google Meetのリンク発行を含む）です。',
          'Googleから取得したデータは上記の目的にのみ使用し、第三者への提供、広告、AIモデルの学習には使用しません。本サービスによるGoogle APIから取得した情報の使用および他アプリへの転送は、Limited Use要件を含む Google API Services User Data Policy に準拠します。',
          'Googleの認証情報は暗号化して保存し、連携を解除すると削除されます。',
        ],
      },
      {
        h: '5. 第三者への提供・外部サービス',
        p: [
          '法令に基づく場合を除き、取得した情報を第三者に提供しません。',
          '本サービスは、ホスティングにVercel、データベースにTurso、カレンダー連携にGoogleのサービスを利用しており、情報はこれらのサービス上に保存・処理されます。',
          '予約が確定すると、Googleカレンダーの招待がお客様のメールアドレス宛てに送信されます。',
        ],
      },
      {
        h: '6. 保存期間と削除',
        p: ['予約情報は、運営者が予約の管理に必要な期間保存します。ご自身の情報の確認・削除をご希望の場合は、運営者にご連絡ください。'],
      },
      {
        h: '7. お問い合わせ',
        p: ['本ポリシーに関するお問い合わせは、予約時に届くカレンダー招待の送信元（運営者）のメールアドレス宛てにご連絡ください。'],
      },
    ],
  },
  terms: {
    title: '利用規約',
    sections: [
      {
        h: '1. 適用',
        p: ['本規約は、MeetFlow（以下「本サービス」）を通じてミーティングを予約するすべての方に適用されます。'],
      },
      {
        h: '2. 予約',
        p: [
          '表示されている空き時間から日時を選び、必要事項を入力して予約を申し込みます。承認制のページでは、運営者が承認した時点で予約が確定します。',
          '正確な情報を入力してください。虚偽の情報による予約は、運営者の判断で取り消すことがあります。',
        ],
      },
      {
        h: '3. 禁止事項',
        p: ['いたずらや大量の予約、他人になりすました予約、本サービスの運営を妨げる行為を禁止します。'],
      },
      {
        h: '4. 変更・キャンセル',
        p: ['運営者の都合により、予約を変更またはキャンセルする場合があります。その際はご連絡します。'],
      },
      {
        h: '5. 免責',
        p: ['本サービスは個人が無償で提供するものであり、停止や不具合、カレンダー連携の遅延などにより生じた損害について、運営者は故意または重大な過失がある場合を除き責任を負いません。'],
      },
      {
        h: '6. 規約の変更',
        p: ['本規約は必要に応じて変更することがあります。変更後の規約は本ページに掲載した時点で効力を生じます。'],
      },
    ],
  },
};

export default function Legal({ kind }: { kind: Kind }) {
  const c = CONTENT[kind];
  return (
    <div className="legal">
      <motion.article
        className="card legal__card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <header className="legal__head">
          <LogoMark size={40} />
          <div>
            <h1 className="legal__title">{c.title}</h1>
            <p className="legal__updated">最終更新日：{UPDATED}</p>
          </div>
        </header>
        {c.sections.map((s) => (
          <section key={s.h} className="legal__section">
            <h2>{s.h}</h2>
            {s.p.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </section>
        ))}
        <nav className="legal__nav">
          <Link to="/privacy">プライバシーポリシー</Link>
          <Link to="/terms">利用規約</Link>
        </nav>
      </motion.article>
    </div>
  );
}
