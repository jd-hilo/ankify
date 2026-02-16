import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function DELETE() {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Delete user's data (cascade will handle related records via foreign keys)
    // The database schema should have ON DELETE CASCADE for related tables
    
    // Delete decks (will cascade to card_concepts)
    const { error: decksError } = await supabase
      .from('decks')
      .delete()
      .eq('user_id', user.id);

    if (decksError) {
      console.error('Error deleting decks:', decksError);
      throw new Error('Failed to delete decks');
    }

    // Delete lectures (will cascade to slide_concepts and card_alignments)
    const { error: lecturesError } = await supabase
      .from('lectures')
      .delete()
      .eq('user_id', user.id);

    if (lecturesError) {
      console.error('Error deleting lectures:', lecturesError);
      throw new Error('Failed to delete lectures');
    }

    // Delete processing jobs
    const { error: jobsError } = await supabase
      .from('processing_jobs')
      .delete()
      .eq('user_id', user.id);

    if (jobsError) {
      console.error('Error deleting jobs:', jobsError);
      // Non-critical, continue
    }

    // Delete the user account from Supabase Auth
    // Note: This requires admin privileges, so we'll use the service role client
    const { createServiceClient } = await import('@/lib/supabase/service');
    const adminClient = createServiceClient();
    
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteUserError) {
      console.error('Error deleting user:', deleteUserError);
      throw new Error('Failed to delete user account');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/user/delete:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete account' },
      { status: 500 }
    );
  }
}
