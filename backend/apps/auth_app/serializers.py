"""
Auth Serializers
"""
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'full_name',
                  'role', 'company_id', 'phone', 'avatar', 'is_active',
                  'date_joined', 'last_login']
        read_only_fields = ['id', 'date_joined', 'last_login']

    def get_full_name(self, obj):
        return obj.get_full_name()


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'phone', 'avatar', 'metadata']
        read_only_fields = ['id', 'email']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'password',
                  'confirm_password', 'role', 'company_id', 'phone']

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('confirm_password'):
            raise serializers.ValidationError({'password': 'Passwords do not match'})
        return attrs

    def validate_role(self, value):
        # Restrict role assignment through public API
        allowed_roles = ['end_user']
        # Only super admins can create admin/developer accounts (handled in view)
        return value

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField(validators=[validate_password])

    def validate_current_password(self, value):
        user = self.context.get('user')
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect')
        return value
