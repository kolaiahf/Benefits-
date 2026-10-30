import { loadBrand } from "../../src/brand";
import "../quotes/quote.css";
import { Newsreader, Noto_Sans } from "next/font/google";

const news = Newsreader({ subsets: ["latin"], weight: ["300", "400"], style: ["normal", "italic"], variable: "--font-news" });
const noto = Noto_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-noto" });

export default function ConnectPage() {
  const productName = loadBrand().productName;
  return (
    <div className={`${news.variable} ${noto.variable} quote-root`}>
      <div className="connect">
        <div className="connect-copy">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div className="brand"><i />{productName}</div>
            <span className="lab">Requested by your broker</span>
          </div>
          <p className="lab" style={{ marginTop: 48 }}>Census, once</p>
          <h1 className="serif">Share your team&apos;s census, <span style={{ fontStyle: "italic" }}>once.</span></h1>
          <p>Your broker needs a list of who is covered to price plans. Payroll connect is not turned on in this version.</p>
          <div className="card">
            <b>Connect payroll</b>
            <p className="lab">Secure connection through Finch</p>
            {/* TODO: after a successful census pull, call Finch /disconnect immediately. If no pull happens, disconnect after 30 days. */}
            <button className="btn gold" type="button" disabled>Connect</button>
          </div>
          <div className="card">
            <b>Upload a CSV</b>
            <p className="lab">Name, date of birth, ZIP, coverage tier</p>
            <a className="btn ghost" href="/quotes">Choose file</a>
          </div>
        </div>
        <aside className="panel glow">
          <p className="lab">How the connection works</p>
          <div className="step"><span className="n">1</span><b>We pull your census once, then disconnect immediately.</b></div>
          <div className="step"><span className="n">2</span><b>If no pull happens, the connection disconnects on its own after 30 days.</b></div>
          <div className="step"><span className="n">3</span><b>You can disconnect anytime.</b></div>
          <p className="lab" style={{ marginTop: 28 }}>What we pull</p>
          <div className="pulls"><span>Names</span><span>Dates of birth</span><span>Home ZIP</span><span>Coverage tier</span></div>
          <div className="never"><b>Never pulled</b><div>Social Security numbers, salary, bank details</div></div>
        </aside>
      </div>
    </div>
  );
}
