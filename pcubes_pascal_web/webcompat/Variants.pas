unit Variants;

{$mode objfpc}{$H+}

interface

uses JS;

type
  Variant = JSValue;

const
  varEmpty = 0;
  varNull = 1;
  varSmallint = 2;
  varInteger = 3;
  varSingle = 4;
  varDouble = 5;
  varCurrency = 6;
  varDate = 7;
  varOleStr = 8;
  varDispatch = 9;
  varError = 10;
  varBoolean = 11;
  varVariant = 12;
  varUnknown = 13;
  varByte = 17;
  varString = 256;
  varTypeMask = $0FFF;
  varArray = $2000;

function VarType(const Value: Variant): Integer;
procedure VarClear(var Value: Variant);

implementation

function VarType(const Value: Variant): Integer;
begin
  if JS.isUndefined(Value) then Exit(varEmpty);
  if JS.isNull(Value) then Exit(varNull);
  if JS.isNumber(Value) then Exit(varDouble);
  if JS.isBoolean(Value) then Exit(varBoolean);
  if JS.isString(Value) then Exit(varString);
  Result := varVariant;
end;

procedure VarClear(var Value: Variant);
begin
  Value := nil;
end;

end.
