import { NextResponse } from "next/server";
import { parseBody, withOwner } from "@/lib/api-server";
import { createCategory, listCategories } from "@/lib/data/categories";
import { categoryInput } from "@/lib/schemas";

export const GET = withOwner(async ({ ownerId }) => listCategories(ownerId));
export const POST = withOwner(async ({ ownerId, req }) => NextResponse.json(await createCategory(ownerId, await parseBody(req, categoryInput)), { status: 201 }));
