import { createClient } from '@/lib/supabase/server';
import type { Lecture } from '@/types/database';
import { LecturesWithUpload } from '@/components/lectures-with-upload';

export default async function LecturesPage() {
  const supabase = await createClient();

  const { data: lecturesData, error } = await supabase
    .from('lectures')
    .select('*')
    .order('created_at', { ascending: false });

  const lectures = (lecturesData || []) as Lecture[];

  return <LecturesWithUpload initialLectures={lectures} error={error?.message || null} />;
}
