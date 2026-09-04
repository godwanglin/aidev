import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword } from "@/lib/session";

async function getSessionUser() {
  const sessionUser = await getCurrentUser();
  if (sessionUser) {
    return prisma.user.findUnique({
      where: { id: sessionUser.id },
      include: {
        _count: {
          select: { apiKeys: true, tokenTopups: true },
        },
      },
    });
  }

  return prisma.user.findUnique({
    where: { email: "admin@devportal.local" },
    include: {
      _count: {
        select: { apiKeys: true, tokenTopups: true },
      },
    },
  });
}

export async function GET() {
  try {
    const user = await getSessionUser();

    // Zero upstream / backend infrastructure leakage
    return NextResponse.json({
      user: {
        id: user?.id,
        email: user?.email || "user@devportal.local",
        name: user?.name || "Developer",
        tokenBalance: Number(user?.tokenBalance || 0),
        totalKeys: user?._count.apiKeys || 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, currentPassword, newPassword } = body;

    const dataToUpdate: any = {};
    if (name) dataToUpdate.name = name;

    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required to set a new password." },
          { status: 400 }
        );
      }

      const hashedCurrent = hashPassword(currentPassword);
      if (user.passwordHash && user.passwordHash !== hashedCurrent) {
        return NextResponse.json(
          { error: "Incorrect current password. Please try again." },
          { status: 400 }
        );
      }

      dataToUpdate.passwordHash = hashPassword(newPassword);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: dataToUpdate,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
