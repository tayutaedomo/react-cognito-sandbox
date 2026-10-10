import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

const STANDARD_ATTRIBUTES = [
  'name', 'family_name', 'given_name', 'middle_name', 'nickname',
  'preferred_username', 'profile', 'picture', 'website', 'email',
  'email_verified', 'gender', 'birthdate', 'zoneinfo', 'locale',
  'phone_number', 'phone_number_verified', 'address', 'updated_at'
];

interface ProfileEditorProps {
  onBack: () => void;
}

const ProfileEditor: React.FC<ProfileEditorProps> = ({ onBack }) => {
  const { getAttributes, updateAttributes } = useAuth();
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    const loadAttributes = async () => {
      try {
        const userAttributes = await getAttributes();
        setAttributes(userAttributes);
      } catch (error: any) {
        console.error('Failed to fetch attributes', error);
        setMessage({ type: 'error', text: `Failed to load profile: ${error.message}` });
      } finally {
        setLoading(false);
      }
    };
    loadAttributes();
  }, [getAttributes]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAttributes(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      // 読み取り専用や空文字の属性を除外
      const updatePayload: Record<string, string> = {};
      for (const [key, value] of Object.entries(attributes)) {
        // email, email_verified, phone_number_verified, updated_at, sub 等は直接入力送信から除外
        if (!['email', 'email_verified', 'phone_number_verified', 'updated_at', 'sub'].includes(key) && value !== '') {
          updatePayload[key] = value;
        }
      }
      
      // OIDC 標準の updated_at 属性は Cognito が自動更新しないため、
      // クライアント側で現在の UNIX タイムスタンプを計算して付与する
      updatePayload['updated_at'] = Math.floor(Date.now() / 1000).toString();
      
      await updateAttributes(updatePayload);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      
      // 更新後に再取得
      const updatedUserAttributes = await getAttributes();
      setAttributes(updatedUserAttributes);
    } catch (error: any) {
      console.error('Failed to update attributes', error);
      setMessage({ type: 'error', text: `Failed to update profile: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="app-shell app-shell--narrow"><p>Loading profile...</p></main>;

  return (
    <main className="app-shell app-shell--narrow">
      <header className="page-heading">
        <button className="button-link" onClick={onBack}>&larr; Back to Home</button>
        <h2>Edit Profile</h2>
      </header>

      {message && (
        <div className={`feedback feedback--${message.type === 'success' ? 'success' : 'error'}`} role={message.type === 'error' ? 'alert' : 'status'}>
          {message.text}
        </div>
      )}

      <section className="panel">
        <form className="form-stack" onSubmit={handleSave}>
          <div className="profile-grid">
            {STANDARD_ATTRIBUTES.map(attr => {
              // email はログインIDとして使用しているため、単純な更新を許可すると
              // 次回以降ログイン不能になるリスクがあるため、フロントエンドからの直接編集は Read Only とする。
              const isReadOnly = ['email', 'email_verified', 'phone_number_verified', 'updated_at'].includes(attr);
              return (
                <div className="form-field" key={attr}>
                  <label htmlFor={attr}>
                    {attr} {isReadOnly && '(Read Only)'}
                  </label>
                  <input
                    id={attr}
                    name={attr}
                    type="text"
                    value={attributes[attr] || ''}
                    onChange={handleChange}
                    disabled={isReadOnly || saving}
                    placeholder={`Enter ${attr}...`}
                  />
                </div>
              );
            })}
          </div>
          <div className="form-actions">
            <button className="button-primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
};

export default ProfileEditor;
