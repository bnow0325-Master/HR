import { NextResponse } from "next/server";

type KakaoRoadAddress = {
  address_name?: string;
};

type KakaoAddress = {
  address_name?: string;
};

type KakaoDocument = {
  road_address?: KakaoRoadAddress | null;
  address?: KakaoAddress | null;
};

type NominatimAddress = {
  road?: string;
  house_number?: string;
  neighbourhood?: string;
  suburb?: string;
  city_district?: string;
  borough?: string;
  city?: string;
  town?: string;
  county?: string;
  state?: string;
  province?: string;
  country?: string;
};

type NominatimResponse = {
  display_name?: string;
  address?: NominatimAddress;
};

function validCoordinate(value: string | null, min: number, max: number) {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function compactAddress(parts: Array<string | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(" ");
}

async function reverseWithKakao(lat: number, lng: number) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return null;

  const url = new URL("https://dapi.kakao.com/v2/local/geo/coord2address.json");
  url.searchParams.set("x", String(lng));
  url.searchParams.set("y", String(lat));

  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const data = (await response.json()) as { documents?: KakaoDocument[] };
  const first = data.documents?.[0];
  return (
    first?.road_address?.address_name ?? first?.address?.address_name ?? null
  );
}

async function reverseWithNominatim(lat: number, lng: number) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "ko");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "bnow-hr/0.1 contact: bnow0325-Master/HR",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const data = (await response.json()) as NominatimResponse;
  const address = data.address;
  if (!address) return data.display_name ?? null;

  const roadLine = compactAddress([address.road, address.house_number]);
  const regionLine = compactAddress([
    address.state ?? address.province,
    address.city ?? address.town ?? address.county,
    address.city_district ?? address.borough,
    address.suburb ?? address.neighbourhood,
  ]);

  return (
    compactAddress([address.country, regionLine, roadLine]) ||
    data.display_name ||
    null
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = validCoordinate(searchParams.get("lat"), -90, 90);
  const lng = validCoordinate(searchParams.get("lng"), -180, 180);

  if (lat === null || lng === null) {
    return NextResponse.json(
      { error: "위치 좌표가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const address =
      (await reverseWithKakao(lat, lng)) ??
      (await reverseWithNominatim(lat, lng));

    if (!address) {
      return NextResponse.json(
        { error: "주소를 찾지 못했습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { address },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      { error: "주소를 가져오지 못했습니다." },
      { status: 502 },
    );
  }
}
