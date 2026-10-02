import { Suspense } from "react"
import { getConsultations } from "@/lib/queries"
import { MeetingsClient } from "@/components/meetings/meetings-client"

export const dynamic = "force-dynamic"

export default async function MeetingsPage() {
  const consultations = await getConsultations()
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
          Meeting Resolution
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Zoom consultations waiting on an attorney. Confirm the matter Clio
          suggested or search for the right one, then file the note.
        </p>
      </div>
      <Suspense>
        <MeetingsClient items={consultations} />
      </Suspense>
    </div>
  )
}
