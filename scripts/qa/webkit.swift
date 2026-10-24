// swift wk.swift <width> <url> <js-file>   runs the script in WebKit (Safari's engine) and prints the result
import AppKit
import WebKit
let a = CommandLine.arguments
let width = CGFloat(Double(a[1])!), url = URL(string: a[2])!, js = try! String(contentsOfFile: a[3])
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let win = NSWindow(contentRect: NSRect(x: -4000, y: 0, width: width, height: 900), styleMask: [.borderless], backing: .buffered, defer: false)
let cfg = WKWebViewConfiguration()
if #available(macOS 14.0, *) { cfg.preferences.inactiveSchedulingPolicy = .none }
let web = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: 900), configuration: cfg)
win.contentView = web; win.orderFrontRegardless()
class D: NSObject, WKNavigationDelegate {
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
      w.callAsyncJavaScript("return await " + js, arguments: [:], in: nil, in: .page) { r in
        switch r { case .success(let v): if let d = try? JSONSerialization.data(withJSONObject: v as Any, options: [.prettyPrinted, .fragmentsAllowed]) { print(String(data: d, encoding: .utf8)!) } else { print(v) }
                   case .failure(let e): print("JS error:", e) }
        exit(0)
      }
    }
  }
}
let d = D(); web.navigationDelegate = d
web.load(URLRequest(url: url))
DispatchQueue.main.asyncAfter(deadline: .now() + 60) { print("timeout"); exit(1) }
app.run()
