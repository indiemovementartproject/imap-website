// Card photo maker for instructor portraits.
//
// The batch cards all share one look: subject lifted off its background, graded
// black-and-white, laid on flat #5CE1E6. Photos that arrive as posters or with
// a real background need putting through this or they stand out badly in the
// carousel.
//
//   swiftc -O scripts/cutout.swift -o /tmp/cutout
//   /tmp/cutout in.jpg out.jpg "#5CE1E6" <ev> <gamma> <contrast> <shadow> [x,y,w,h]
//
// Aryamann's card was built with: 1.4 0.62 1.22 0.34 "88,10,396,495"
// then scaled to 1080x1350 with sips -Z 1350, which is the size every other
// card uses. Low-key source photographs need the ev/gamma lift; a normally
// exposed one will want closer to 0 / 1.0.
//
import Foundation
import CoreImage
import CoreImage.CIFilterBuiltins
import Vision
import AppKit

// Lift the subject off its background with Vision, grade it black-and-white,
// and lay it on the flat card colour the other instructor photos use.
//   cutout <in> <out> <hex> <exposure> <gamma> <contrast> <shadow> [crop] [--maskonly]
//
// The source is a low-key theatre photograph: almost everything sits in the
// bottom third of the range. Lifting exposure and gamma BEFORE the contrast
// curve is what keeps the dark shirt from crushing to a silhouette.

func die(_ m: String) -> Never { FileHandle.standardError.write((m + "\n").data(using: .utf8)!); exit(1) }

let a = CommandLine.arguments
guard a.count >= 8 else { die("usage: cutout <in> <out> <hex> <ev> <gamma> <contrast> <shadow> [x,y,w,h]") }
let inPath = a[1], outPath = a[2], hex = a[3]
let ev       = Double(a[4]) ?? 0.0
let gamma    = Double(a[5]) ?? 1.0           // <1 brightens midtones
let contrast = Double(a[6]) ?? 1.3
let shadow   = Double(a[7]) ?? 0.18          // y at x=0.25; lower = darker
let maskOnly = a.contains("--maskonly")
var crop: CGRect? = nil
if a.count > 8, !a[8].hasPrefix("--") {
    let n = a[8].split(separator: ",").compactMap { Double($0) }
    if n.count == 4 { crop = CGRect(x: n[0], y: n[1], width: n[2], height: n[3]) }
}

guard let nsImage = NSImage(contentsOfFile: inPath),
      let cgImage = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil)
else { die("cannot read \(inPath)") }

let W = cgImage.width, H = cgImage.height
let ctx = CIContext()
let source = CIImage(cgImage: cgImage)

// ---- 1. subject mask -------------------------------------------------
let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])
guard let obs = request.results?.first, !obs.allInstances.isEmpty else {
    die("Vision found no foreground subject")
}
FileHandle.standardError.write("instances: \(obs.allInstances.count)\n".data(using: .utf8)!)

let maskBuffer = try obs.generateScaledMaskForImage(forInstances: obs.allInstances,
                                                    from: handler)
var mask = CIImage(cvPixelBuffer: maskBuffer)
// the mask comes back at the model's own scale; stretch it onto the photo
let sx = CGFloat(W) / mask.extent.width, sy = CGFloat(H) / mask.extent.height
mask = mask.transformed(by: CGAffineTransform(scaleX: sx, y: sy))

if maskOnly {
    guard let out = ctx.createCGImage(mask, from: CGRect(x: 0, y: 0, width: W, height: H))
    else { die("mask render failed") }
    let rep = NSBitmapImageRep(cgImage: out)
    try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: outPath))
    print("mask -> \(outPath)")
    exit(0)
}

// ---- 2. grade the subject: desaturate, add contrast, deepen shadows ----
let exposure = CIFilter.exposureAdjust()
exposure.inputImage = source
exposure.ev = Float(ev)
var subject = exposure.outputImage!

let gam = CIFilter.gammaAdjust()
gam.inputImage = subject
gam.power = Float(gamma)
subject = gam.outputImage!

let grey = CIFilter.colorControls()
grey.inputImage = subject
grey.saturation = 0
grey.contrast = Float(contrast)
grey.brightness = 0
subject = grey.outputImage!

// An S-curve: shadows fall away, midtones hold so the face stays readable,
// highlights lift so the figure separates from the cyan.
let curve = CIFilter.toneCurve()
curve.inputImage = subject
curve.point0 = CGPoint(x: 0.00, y: 0.00)
curve.point1 = CGPoint(x: 0.25, y: shadow)
curve.point2 = CGPoint(x: 0.50, y: 0.54)
curve.point3 = CGPoint(x: 0.75, y: 0.88)
curve.point4 = CGPoint(x: 1.00, y: 1.00)
subject = curve.outputImage!

// ---- 3. composite onto the flat card colour ---------------------------
func colour(_ h: String) -> CIColor {
    var s = h.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
    let v = UInt32(s, radix: 16) ?? 0
    return CIColor(red:   CGFloat((v >> 16) & 0xFF) / 255.0,
                   green: CGFloat((v >>  8) & 0xFF) / 255.0,
                   blue:  CGFloat( v        & 0xFF) / 255.0)
}
let bg = CIImage(color: colour(hex)).cropped(to: CGRect(x: 0, y: 0, width: W, height: H))

let blend = CIFilter.blendWithMask()
blend.inputImage = subject
blend.backgroundImage = bg
blend.maskImage = mask
guard let composed = blend.outputImage else { die("composite failed") }
// Core Image y-axis runs bottom-up; take crops in familiar top-down terms.
var frame = CGRect(x: 0, y: 0, width: W, height: H)
if let c = crop { frame = CGRect(x: c.minX, y: CGFloat(H) - c.minY - c.height,
                                 width: c.width, height: c.height) }
guard let outCG = ctx.createCGImage(composed, from: frame) else { die("crop failed") }

let rep = NSBitmapImageRep(cgImage: outCG)
guard let jpg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.92])
else { die("encode failed") }
try jpg.write(to: URL(fileURLWithPath: outPath))
print("\(Int(frame.width))x\(Int(frame.height)) -> \(outPath)")
