import { redirect } from 'next/navigation'

interface Props { params: { churchSlug: string } }

export default function MySetupPage({ params }: Props) {
  redirect(`/${params.churchSlug}/settings/my-setup/flows`)
}
