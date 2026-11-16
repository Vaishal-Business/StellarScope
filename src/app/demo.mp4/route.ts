import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

export const runtime = "nodejs";

const videoPath = `${process.cwd()}/demo.mp4`;

function notFound() {
  return new Response("Video not found", { status: 404 });
}

async function serveVideo(request: Request, includeBody: boolean) {
  let size: number;

  try {
    ({ size } = await stat(videoPath));
  } catch {
    return notFound();
  }

  const range = request.headers.get("range");
  let start = 0;
  let end = size - 1;
  let status = 200;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    if (match[1] === "") {
      const suffixLength = Number(match[2]);
      start = Math.max(size - suffixLength, 0);
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
    }

    if (start >= size || start > end) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    status = 206;
  }

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
    "Content-Length": String(end - start + 1),
    "Content-Type": "video/mp4",
  });

  if (status === 206) {
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }

  const body = includeBody
    ? (Readable.toWeb(createReadStream(videoPath, { start, end })) as ReadableStream<Uint8Array>)
    : null;

  return new Response(body, { status, headers });
}

export async function GET(request: Request) {
  return serveVideo(request, true);
}

export async function HEAD(request: Request) {
  return serveVideo(request, false);
}
