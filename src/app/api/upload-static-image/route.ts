// app/api/upload-static-image/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lazy init — do NOT instantiate at module load
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const MIN_W = 1920
const MIN_H = 1080

export async function POST(req: NextRequest) {
  try {
    // --- Auth: match the pattern used elsewhere in this repo ---
    // Read the access token from the Authorization header OR Supabase cookie
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getAdmin()
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = userData.user.id

    // --- Parse multipart body ---
    const form = await req.formData()
    const file = form.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // --- MIME check ---
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Use JPEG, PNG, or WebP.' },
        { status: 415 }
      )
    }

    // --- Size check ---
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'File too large. Max 10MB.' },
        { status: 413 }
      )
    }

    // --- Read into buffer ---
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // --- Resolution check via sharp ---
    const meta = await sharp(buffer).metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    const meetsMin =
      (w >= MIN_W && h >= MIN_H) || (w >= MIN_H && h >= MIN_W)
    if (!meetsMin) {
      return NextResponse.json(
        { error: 'Image must be at least 1920×1080' },
        { status: 422 }
      )
    }

    // --- Upload to Supabase Storage ---
    const ext =
      file.type === 'image/jpeg' ? 'jpg'
      : file.type === 'image/png' ? 'png'
      : 'webp'
    const path = `${userId}/${randomUUID()}.${ext}`

    const { error: uploadErr } = await admin.storage
      .from('static-images')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadErr) {
      console.error('[upload-static-image] storage error', uploadErr)
      return NextResponse.json(
        { error: 'Upload failed' },
        { status: 500 }
      )
    }

    // --- Get public URL ---
    const { data: pub } = admin.storage
      .from('static-images')
      .getPublicUrl(path)

    return NextResponse.json({
      url: pub.publicUrl,
      width: w,
      height: h,
      size: file.size,
    })
  } catch (err: any) {
    console.error('[upload-static-image] unexpected', err)
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    )
  }
}